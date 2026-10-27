# contributing

pull requests welcome

## setup

```bash
git clone https://github.com/kln-100/sticky-notes
cd sticky-notes
claude --plugin-dir .
```

## testing changes

edit `hooks/register.tsx`, the plugin hot-reloads on save

validate before PR:
```bash
claude plugin validate .
```

## guidelines

- keep it simple
- test your changes
- one feature per PR
