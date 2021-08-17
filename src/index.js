const promisify = require('promisify-node');
const R = require('ramda');
const Rx = require('rxjs');
const fse = promisify(require('fs-extra'));
const path = require('path');
const git = require('nodegit');
const notifier = require('node-notifier');
const program = require('commander');
const si = require('systeminformation');
const chokidar = require('chokidar');
const log = require('nlogn');

program
  .version(require('../package.json').version)
  .option(
    '--repo-path <path>',
    'path to a git repository to store clippings (ex. ~/repo/.git)',
  )
  .parse(process.argv);

if (!program.repoPath) {
  throw new Error('No git repository path provided');
}

const watcher = chokidar.watch('/Volumes', {
  depth: 0,
  ignored: /(^|[/\\])\../,
});

Rx.Observable.fromEvent(watcher, 'addDir')
  .filter(mountPath => {
    const pathSegmentsCount = mountPath.split(/\\|\//).length - 1;
    return pathSegmentsCount === 2;
  })
  .flatMap(mountPath =>
    Rx.Observable.fromPromise(
      si
        .blockDevices()
        .then(blockDeviceInfo =>
          blockDeviceInfo
            .filter(
              info => info.label.includes('Kindle') && info.mount === mountPath,
            )
            .map(({ mount, uuid }) => ({ mountPoint: mount, serial: uuid })),
        ),
    ),
  )
  .filter(R.complement(R.isEmpty))
  .flatMap(Rx.Observable.from)
  .subscribe(handleKindleFsMount);

const ICON_PATH = path.join(__dirname, '..', 'icon.png');
const REPO_PATH = program.repoPath;
log.info(REPO_PATH);
// https://github.com/nodegit/nodegit/blob/377366cdfcf5329b2c4c9d729704edef786841c9/examples/add-and-commit.js
// ensureDir is an alias to mkdirp, which has the callback with a weird name
// and in the 3rd position of 4 (the 4th being used for recursion). We have to
// force promisify it, because promisify-node won't detect it on its
// own and assumes sync
fse.ensureDir = promisify(fse.ensureDir);

async function tryGetRepoHeadCommit(repo) {
  let headCommit;
  try {
    const head = await git.Reference.nameToId(repo, 'HEAD');
    headCommit = await repo.getCommit(head);
  } catch (ex) {
    headCommit = null;
  }

  return headCommit;
}

async function commitClippingsToRepo(clippings, serial, repoPath) {
  const author = git.Signature.now(
    'kindle-clipping-sync',
    'kindle@clipping.sync',
  );
  const committer = git.Signature.now(
    'kindle-clipping-sync',
    'kindle@clipping.sync',
  );
  try {
    const repo = await git.Repository.open(repoPath);
    const clippingsPath = path.join(repo.workdir(), serial, 'clippings.txt');
    await fse.ensureFile(clippingsPath);
    await fse.writeFile(clippingsPath, clippings);

    const index = await repo.refreshIndex();
    index.read(1);

    const checksumBefore = index.checksum().tostrS();
    log.info(checksumBefore);
    await index.addAll();
    await index.write();
    const checksumAfter = index.checksum().tostrS();
    log.info(checksumAfter);

    if (checksumBefore !== checksumAfter) {
      const oid = await index.writeTree();
      const parent = await tryGetRepoHeadCommit(repo);
      const commitId = await repo.createCommit(
        'HEAD',
        author,
        committer,
        `:books: add clippings for ${serial}`,
        oid,
        parent ? [parent] : [],
      );
      return commitId;
    }
  } catch (ex) {
    log.warn(ex);
  }
  return undefined;
}

async function handleKindleFsMount({ serial, mountPoint }) {
  const clippingsFilename = 'My Clippings.txt';
  const clippingsPath = path.join(mountPoint, 'documents', clippingsFilename);

  log.info(`serial: ${serial}\nmountPoint: ${mountPoint}\n`);
  try {
    await fse.access(clippingsPath, fse.R_OK);
    const clippings = await fse.readFile(clippingsPath, 'utf8');
    const commitId = await commitClippingsToRepo(clippings, serial, REPO_PATH);
    log.info(`new commit: ${commitId}`);
    notifier.notify({
      title: 'kindle-clipping-sync',
      message: commitId
        ? 'Added new clippings to repository'
        : 'No new clippings to add',
      icon: ICON_PATH,
    });
  } catch (ex) {
    log.warn(ex);
  }
}
