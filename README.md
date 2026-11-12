# Context Meter

Version 1.0.0

One dim line above the prompt: how full this chat is (“Chat 42% full (84K of 200K)”) and how much of the five-hour and weekly limits is used (“Five-hour 37% · Week 12%”). Each percentage is coloured by level: green below 30%, orange from 30%, red from 50%, red and bold from 80%.

Display only. It hooks no prompt, tool or message event, so it never holds, intercepts or changes anything you send. It reads numbers the session already has and stores nothing across sessions.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install context-meter --marketplace jamessteincamp/context-meter
```

Answer `y` to add the marketplace, then press Enter to install at user scope.

From a shell:

```
claude plugin install context-meter --marketplace jamessteincamp/context-meter
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `jamessteincamp/context-meter`, then Add plugin.

## Uninstall

```
claude plugin uninstall context-meter@context-meter
claude plugin marketplace remove context-meter
```

## Credit

Stripped down from `usage-meter` by Christian Peverelli, WeAreNoCode, part of the “7 Claude Mods” collection. The cold-chat warning, the prompt-holding hook, the warm/cold timer and the buttons are removed; the colour bands and labels are new.
