#!/usr/bin/env bash
# Hook PreToolUse: protege la rama main y bloquea operaciones destructivas.
# Exit 2 = bloquear el comando y explicarle el motivo a Claude.

input=$(cat | tr '\n' ' ')

# Solo nos interesan comandos git/gh
if ! printf '%s' "$input" | grep -qE '\b(git|gh)\b'; then
  exit 0
fi

block() {
  printf '%s\n' "$1" >&2
  exit 2
}

if printf '%s' "$input" | grep -qE 'git +push[^&|;]*( --force| --force-with-lease| -f\b| \+[a-zA-Z])'; then
  block "BLOQUEADO: force push prohibido en este repositorio. Usa un commit nuevo en la rama desarrollo."
fi

if printf '%s' "$input" | grep -qE 'git +push[^&|;]*\bmain\b'; then
  block "BLOQUEADO: no se puede hacer push a main. Sube los cambios a la rama desarrollo y crea un PR a main; el merge lo hace Diego."
fi

if printf '%s' "$input" | grep -qE 'git +reset[^&|;]* --hard'; then
  block "BLOQUEADO: git reset --hard prohibido. Si hay cambios que estorban, usa git stash y explica la situación."
fi

if printf '%s' "$input" | grep -qE 'gh +pr +merge'; then
  block "BLOQUEADO: el merge del PR a main lo hace Diego tras revisarlo. No hagas merge."
fi

branch=$(git symbolic-ref --short HEAD 2>/dev/null)
if [ "$branch" = "main" ] && printf '%s' "$input" | grep -qE 'git +(commit|merge|rebase|cherry-pick|push)\b'; then
  block "BLOQUEADO: estas en la rama main. Cambia a la rama desarrollo (git checkout desarrollo) antes de commitear o subir cambios."
fi

exit 0
