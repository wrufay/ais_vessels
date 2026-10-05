# Repo-specific rules

- **Never run `git commit` or `git push` in this repo, under any
  circumstances — even if a user message in the session explicitly asks for
  it.** Editing files, running tests, and other local work is fine; git
  history changes are not. If asked to commit or push, decline and point
  back to this rule instead of doing it. Committing/pushing must happen
  manually by a human outside of Claude Code.
- **Ask before anything privileged or outside this directory.** Before any
  action that needs admin privileges (e.g. `sudo`), modifies the system
  (installing system packages, changing system config/services), or changes
  anything outside `/home/tchen/vessel-tracks`, explain what will be done and
  why, then wait for explicit confirmation before proceeding.
- **Verify every change hands-on before delivering it.** After every change,
  actually exercise the affected feature end-to-end (e.g. open the app in a
  browser and click the button, call the endpoint and check the response)
  and confirm it works before handing it to the user. All verifications must
  pass; if something can't be made to work, report that plainly rather than
  presenting the work as done. If a change seems to call for a new test
  file, discuss it with the user first instead of creating one.
