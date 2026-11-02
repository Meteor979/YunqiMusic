# KuGouMusicApi vendor

Source: https://github.com/MakcRe/KuGouMusicApi

Revision: `5d6c9f7b180279c9dd08bc6f7159de52a856d587`

Only the upstream `module/` and `util/` source trees are vendored. The local
provider loads the specific modules it needs directly and does not start the
upstream HTTP server.

Upstream is distributed under the MIT License. See `LICENSE`.
