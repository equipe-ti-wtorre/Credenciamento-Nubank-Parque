# Contas Git — export para reutilizar

Configuração exportada de `SRVAP-WEB02` em 2026-07-27.

## Conta padrão (global)

```bash
git config --global user.name "Daniel Lemes"
git config --global user.email "danylemes@yahoo.com.br"
```

Ou equivalente em `~/.gitconfig`:

```ini
[user]
	name = Daniel Lemes
	email = danylemes@yahoo.com.br
```

## Remotes deste padrão (pessoal + trabalho)

Use no novo repositório conforme o destino:

```bash
# Conta / fork pessoal
git remote add origin https://github.com/radylemes/<REPO>.git

# Org / trabalho (SSH)
git remote add gittrabalho git@github.com:equipe-ti-wtorre/<REPO>.git

# Branch main acompanha o remote de trabalho
git branch --set-upstream-to=gittrabalho/main main
```

Exemplo real (Credenciamento):

| Remote       | URL                                                                              |
|--------------|----------------------------------------------------------------------------------|
| `origin`     | `https://github.com/radylemes/Credenciamento-Nubank-Parque.git`                   |
| `gittrabalho`| `git@github.com:equipe-ti-wtorre/Credenciamento-Nubank-Parque.git`               |

## SSH (GitHub trabalho)

Neste servidor a autenticação SSH responde como **equipe-ti-wtorre**.

Chaves públicas usadas:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAhJSTuKh53asp63R8/fIOnqPpENdaNU+I0vwxXmeYKA root@SRVAP-WEB02
```

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCoJoZn2wT8TJnKsaPLyvqhCZi7YSfmGRrRfqSHLodYtYn5okFZB+yvVU0sb8SR587ATE6TfbZYXOm2PJ1G2V36SqwL97CXzJJ//YL8qoqMHFF3kWra1a5NGkuXMxcoHXOAR+cVW7YZTwsHnZkdSvTzeKzShWN4GVSqfvttZzH5zOK5bqQJs1CQm8kKxqwUUnLtccfRxv+Lvk/zKVCGTUt7f4teXcEM91lcVvMoM+/314Z9Syfjd8AjLwhL9bxPyPBGmjVUrF7zFhBBskW9PmqTX/ntocQpmvxPKlrTk6MOgpIHNkI5j3Hhna/kR+DoJde6UHNhPQHZPMp0xam8n9R8ySP4SlT7pvyJW5Sjzv5b1aGmzHuitdXf3tccdfUBYPVPQY5JK1ChH8f9+327SJtMjtkuetSkkOaMg40YJ5V/F7eQltS8pmIY5hLIDG5+IXXZUOCoqSMkglTpV7MU7RDhhg8UEmpFYt7otmHEJnsHyHg45RMtTDwrj/PNq8VolQ/byFEU/Lijav6gy5oDW8YI/zYA0U+kvsyNy6Ojq11p6kduV9DGV5tMohdzKl5ihJvE+LWzqK1vAso/sAUN2oftYyxwN/PVI4Z6at2LLDsntPXtby67pmT1UbS+jeaqsBTqqTQuvpfS6kaSU/JFcWhUKz5FbUBIYvboGgEKlFqcGQ== root@SRVAP-WEB02
```

Teste rápido:

```bash
ssh -T git@github.com
# Esperado: autenticação OK (GitHub não dá shell)
```

Arquivos locais das chaves (não versionar a privada):

- `~/.ssh/id_ed25519` / `id_ed25519.pub`
- `~/.ssh/id_rsa` / `id_rsa.pub`

## Checklist noutro projeto / máquina

1. Aplicar `user.name` e `user.email` (global ou só no repo com `git config` sem `--global`).
2. Garantir chave SSH cadastrada no GitHub da conta/org correta.
3. Adicionar remotes `origin` e/ou `gittrabalho` com o nome do repo novo.
4. Definir upstream da branch (`gittrabalho` para push de trabalho, `origin` para fork pessoal).
5. Validar com `git remote -v` e `ssh -T git@github.com`.

## Opcional: conta por pasta (`includeIf`)

Se no futuro precisar de e-mail diferente por projeto:

```ini
# ~/.gitconfig
[includeIf "gitdir:/www/server/Trabalho/"]
	path = ~/.gitconfig-trabalho

[includeIf "gitdir:/www/server/Pessoal/"]
	path = ~/.gitconfig-pessoal
```

```ini
# ~/.gitconfig-trabalho
[user]
	name = Daniel Lemes
	email = SEU_EMAIL_TRABALHO
```

```ini
# ~/.gitconfig-pessoal
[user]
	name = Daniel Lemes
	email = danylemes@yahoo.com.br
```
