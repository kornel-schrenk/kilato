# Checks workflow files against the published workflow schema.
#   python3 -I schema-check.py <github-workflow.json> <workflow.yml>...
import json, sys, yaml, jsonschema
schema = json.load(open(sys.argv[1], encoding='utf8'))
for path in sys.argv[2:]:
    raw = yaml.safe_load(open(path, encoding='utf8'))
    # YAML 1.1 reads the bare key `on` as true. The schema wants the string.
    doc = {('on' if k is True else k): v for k, v in raw.items()}
    errors = list(jsonschema.Draft7Validator(schema).iter_errors(doc))
    print(path.rsplit('/', 1)[-1], len(errors), 'errors')
    for e in errors[:5]:
        print('  ', list(e.absolute_path), e.message[:160])
