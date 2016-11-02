# <img src="https://cdn.rawgit.com/akatopo/kindle-clipping-sync/master/icon.svg" alt="app logo" width="40" height="40" style="vertical-align:middle"> kindle-clipping-sync

Checks for a kindle mount event and commits clippings to a git repository. Tested on a Kindle 3 (keyboard). Works on Linux.

<img src="screenshot.png" alt="app screenshot" width="322" height="105">

## Installation

```
$ npm install -g kindle-clipping-sync
```

:warning: For ubuntu 16.04, if you're getting an error when trying to install nodegit that looks like this: `configure: error: cannot find OpenSSL or Libgcrypt, try --with-libssl-prefix=PATH or --with-libgcrypt-prefix=PATH`, install libssl-dev (`sudo apt install libssl-dev`). [Relevant nodegit issue](https://github.com/nodegit/nodegit/issues/728#issuecomment-247030632) 

## Usage

```
$ kindle-clipping-sync --repo-path /path/to/repo/.git
```

When a kindle is mounted, clippings will be copied over to `/path/to/repo/<serialNumber>/clippings.txt` and committed if there are changes.

## Building

Requires

* node `>= 4.0.0`
* npm
* gulp

To install dependencies run `npm install`

To build run `gulp build`, the app will be in the `lib/` folder
