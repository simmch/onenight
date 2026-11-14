---
description: Stage every change, commit it, and push the branch
---

Stage the working tree, commit it, and push the current branch. Do this only because this command was invoked.

From the project root, run these in parallel first:

- `git status`
- `git diff` and `git diff --staged`
- `git log -8 --oneline`

Then:

1. If a file looks like a secret (`.env`, credentials, keys, tokens), stop and say so. Do not stage or commit it.
2. Run `git add .`
3. If there is nothing to commit, do not create an empty commit. If the branch is already ahead of its remote, push that. Otherwise say the tree is clean.
4. Write a 1–2 sentence commit message that matches recent messages and says why the change exists. Pass it with a HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Commit message here.

EOF
)"
```

5. If a hook rejects the commit, fix the problem and make a new commit. Do not amend.
6. Push the current branch. Use `git push -u origin HEAD` only when the branch has no upstream. Never force-push. Never update git config, and never skip hooks.
7. Run `git status` after the push. Tell the user the commit subject and that the push finished. If the push fails, show the error and do not try a second push.
