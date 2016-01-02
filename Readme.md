# cas-server-pg-ticket-registry

This module provides a reference implementation of a ticket registry plugin
for [cas-server][cs].

Intializing the plugin requires a [knex][knex] compatible
[configuration object][kfile] specifying the database connection details:

```javscript
{
  client: 'postgresql',
  connection: {
    database: 'casserver',
    user: 'casserver'
  }
}
```

[cs]: https://github.com/jscas/cas-server
[knex]: http://knexjs.org/
[kfile]: http://knexjs.org/#knexfile

## License

[MIT License](http://jsumners.mit-license.org/)
