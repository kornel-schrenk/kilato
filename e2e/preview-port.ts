// Each run gets its own preview port, taken from the process id. The range 20000 to 20999
// holds none of the ports the Fetch standard blocks (browsers refuse those with
// net::ERR_UNSAFE_PORT), and 1,000 remainders keep parallel worktrees apart.
export function previewPort(pid: number): number {
  return 20000 + (pid % 1000)
}
