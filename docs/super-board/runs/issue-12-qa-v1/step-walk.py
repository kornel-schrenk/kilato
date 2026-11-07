# Which steps of deploy.yml run, in each case the spec names? deploy-workflow.test.ts reads the file as text and
# compares each `if:` with a literal, so it can't say what those conditions do. This reads the file as YAML,
# works out each `if:` with GitHub's rules, and compares the steps that run with a table written by hand from the spec.
#   python3 -I step-walk.py <deploy.yml>
#
# GitHub's rules used here, from docs.github.com/en/actions/reference/workflows-and-actions/:
# - contexts: "If you attempt to dereference a nonexistent property, it will evaluate to an empty string."
#   So on a push or a schedule, inputs.rebuild_data is ''.
# - expressions: in a conditional, false, 0, '', and null are falsy, and `a || b` gives the first truthy value.
# - expressions: a step whose `if` has no status function gets `success() &&` in front.
import re, sys, yaml

doc = yaml.safe_load(open(sys.argv[1], encoding='utf8'))
steps = doc['jobs']['deploy']['steps']


def tokens(text):
    return re.findall(r"\|\||&&|==|!=|!|\(|\)|'[^']*'|[A-Za-z_][\w.\-]*", text)


class Eval:
    """A small recursive-descent reader for the part of GitHub's expression language this file uses."""

    def __init__(self, text, ctx):
        self.t, self.i, self.ctx = tokens(text), 0, ctx

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self):
        self.i += 1
        return self.t[self.i - 1]

    def or_(self):
        left = self.and_()
        while self.peek() == '||':
            self.take()
            right = self.and_()
            left = left if left else right
        return left

    def and_(self):
        left = self.cmp()
        while self.peek() == '&&':
            self.take()
            right = self.cmp()
            left = right if left else left
        return left

    def cmp(self):
        left = self.unary()
        if self.peek() in ('==', '!='):
            op = self.take()
            right = self.unary()
            same = str(left).lower() == str(right).lower()
            return same if op == '==' else not same
        return left

    def unary(self):
        if self.peek() == '!':
            self.take()
            return not self.unary()
        token = self.take()
        if token == '(':
            value = self.or_()
            assert self.take() == ')'
            return value
        if token.startswith("'"):
            return token[1:-1]
        if self.peek() == '(':
            self.take()
            assert self.take() == ')'
            return {'cancelled': self.ctx['cancelled'], 'success': not self.ctx['failed'] and not self.ctx['cancelled']}[token]
        return self.ctx['values'][token]


def walk(case):
    """Goes through the steps in order. A step that "fails" here fails the job from then on."""
    ran, failed = [], False
    hit = case['hit']
    # A real workflow_dispatch with the box unticked gives false. A push or a schedule has no such input, so ''.
    rebuild = {'push': '', 'schedule': '', 'dispatch': False, 'dispatch-ticked': True}[case['event']]
    values = {'steps.cache.outputs.cache-hit': 'true' if hit else 'false', 'inputs.rebuild_data': rebuild}
    for step in steps:
        name = step['name']
        condition = str(step.get('if', ''))
        condition = re.sub(r'^\$\{\{|\}\}$', '', condition.strip()).strip()
        ctx = {'values': values, 'failed': failed, 'cancelled': case.get('cancel_at') == name or (case.get('cancelled', False))}
        if case.get('cancel_at') == name:
            case['cancelled'] = True
        has_status = re.search(r'\b(cancelled|always|failure|success)\(', condition)
        run = (not failed and not ctx['cancelled']) if not condition else Eval(condition, ctx).or_()
        if condition and not has_status:
            run = bool(run) and not failed and not ctx['cancelled']
        if not run:
            continue
        ran.append(name)
        if case.get('fail_at') == name:
            failed = True
    return ran


BASE_START = ['Check out', 'Set up Node', 'Install dependencies', "Work out this week's cache key", 'Restore the data cache']
REBUILD = ['Install osmium-tool', 'Download the Hungary extract', 'Build the data']
DROP = ['Drop the cached data this rebuild replaces']
SAVE = ['Save the data cache']
PUBLISH = ['Build the page', 'Copy the data into the page', 'Upload the site', 'Deploy the site']
KEEP = ['Keep the schedule alive']

# Written by hand from the spec's "deploy.yml" section and the issue's ACs, not from the workflow.
CASES = [
    ('a push, this week is cached: reuse it', dict(event='push', hit=True), BASE_START + PUBLISH + KEEP),
    ('a push, first of the week: rebuild', dict(event='push', hit=False), BASE_START + REBUILD + SAVE + PUBLISH + KEEP),
    ('the schedule, this week is cached: reuse it', dict(event='schedule', hit=True), BASE_START + PUBLISH + KEEP),
    ('the schedule, first of the week: rebuild', dict(event='schedule', hit=False), BASE_START + REBUILD + SAVE + PUBLISH + KEEP),
    ('by hand, box unticked, cached: reuse it', dict(event='dispatch', hit=True), BASE_START + PUBLISH + KEEP),
    ('by hand, box unticked, not cached: rebuild', dict(event='dispatch', hit=False), BASE_START + REBUILD + SAVE + PUBLISH + KEEP),
    ('by hand, box ticked, cached: rebuild, replace the cache', dict(event='dispatch-ticked', hit=True), BASE_START + REBUILD + DROP + SAVE + PUBLISH + KEEP),
    ('by hand, box ticked, not cached: rebuild, nothing to replace', dict(event='dispatch-ticked', hit=False), BASE_START + REBUILD + SAVE + PUBLISH + KEEP),
    # "The build fails, and nothing deploys." The old cache must survive a failed rebuild. The enable call still runs.
    ('the data build fails on a rebuild over a cache', dict(event='dispatch-ticked', hit=True, fail_at='Build the data'), BASE_START + REBUILD + KEEP),
    ('the data build fails on a miss', dict(event='schedule', hit=False, fail_at='Build the data'), BASE_START + REBUILD + KEEP),
    ('the download fails its .md5', dict(event='schedule', hit=False, fail_at='Download the Hungary extract'), BASE_START + REBUILD[:2] + KEEP),
    ('the deploy itself fails', dict(event='push', hit=True, fail_at='Deploy the site'), BASE_START + PUBLISH + KEEP),
    ('npm ci fails', dict(event='push', hit=True, fail_at='Install dependencies'), BASE_START[:3] + KEEP),
    ('cancelled during the deploy: no enable call', dict(event='push', hit=True, cancelled_after='Deploy the site'), None),
]

wrong = 0
for title, case, want in CASES:
    if 'cancelled_after' in case:
        # Cancelled once the deploy step has run: every later step sees cancelled() true.
        names = [s['name'] for s in steps]
        last = case.pop('cancelled_after')
        keep = names[names.index(last) + 1]
        case['cancel_at'] = keep
        want = BASE_START + PUBLISH
    got = walk(dict(case))
    ok = got == want
    wrong += not ok
    print(f"{'ok   ' if ok else 'WRONG'} {title}")
    if not ok:
        print('      want', want)
        print('      got ', got)

print()
print(f'{len(CASES) - wrong} of {len(CASES)} cases match the table.')

# What the text-reading test takes on trust: the file really parses to these values.
on = doc[True]  # YAML 1.1 reads the bare key `on` as true.
facts = [
    ('push branches', on['push']['branches'] == ['main']),
    ('schedule', on['schedule'] == [{'cron': '17 3 * * 1'}]),
    ('rebuild_data is boolean', on['workflow_dispatch']['inputs']['rebuild_data']['type'] == 'boolean'),
    ('only three triggers', set(on) == {'push', 'schedule', 'workflow_dispatch'}),
    ('permissions', doc['permissions'] == {'contents': 'read', 'pages': 'write', 'id-token': 'write', 'actions': 'write'}),
    ('concurrency', doc['concurrency'] == {'group': 'pages', 'cancel-in-progress': False}),
    ('one job', list(doc['jobs']) == ['deploy']),
    ('no job-level if', 'if' not in doc['jobs']['deploy']),
    ('no job-level permissions', 'permissions' not in doc['jobs']['deploy']),
    ('no continue-on-error anywhere', not any('continue-on-error' in s for s in steps) and 'continue-on-error' not in doc['jobs']['deploy']),
    ('environment', doc['jobs']['deploy']['environment']['name'] == 'github-pages'),
    ('last step is the enable call', 'workflows/deploy.yml/enable' in steps[-1]['run'] and '--method PUT' in steps[-1]['run']),
    ('every action is pinned to a major', all(re.fullmatch(r'actions/[\w\-/]+@v\d+', s['uses']) for s in steps if 'uses' in s)),
    ('no ${{ }} inside a run script', not any('${{' in s.get('run', '') for s in steps)),
]
print()
for name, ok in facts:
    wrong += not ok
    print(f"{'ok   ' if ok else 'WRONG'} {name}")
sys.exit(1 if wrong else 0)
