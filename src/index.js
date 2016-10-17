import dbus from 'dbus-native';
import promisify from 'promisify-node';
import R from 'ramda';
import log from './log';
import { curried as dbusUtils } from './dbus-utils';
import Rx from 'rxjs';
const fse = promisify(require('fs-extra'));
import path from 'path';
import git from 'nodegit';
import libnotify from 'libnotify';
import program from 'commander';

program
  .version(require('../package.json').version)
  .option('--repo-path <path>', 'path to a git repository to store clippings (ex. ~/repo/.git)')
  .parse(process.argv);

if (!program.repoPath) {
  throw new Error('No git repository path provided');
}

const ICON_PATH = path.join(__dirname, '..', 'icon.svg');
const REPO_PATH = program.repoPath;
log.info(REPO_PATH);
// https://github.com/nodegit/nodegit/blob/377366cdfcf5329b2c4c9d729704edef786841c9/examples/add-and-commit.js
// ensureDir is an alias to mkdirp, which has the callback with a weird name
// and in the 3rd position of 4 (the 4th being used for recursion). We have to
// force promisify it, because promisify-node won't detect it on its
// own and assumes sync
fse.ensureDir = promisify(fse.ensureDir);


const udisksService = dbus
  .systemBus()
  .getService('org.freedesktop.UDisks2');

const getUdisksInterface = promisify(udisksService.getInterface)
  .bind(udisksService);

(async function main() {
  try {
    const objectManager = await getUdisksInterface(
      '/org/freedesktop/UDisks2',
      'org.freedesktop.DBus.ObjectManager'
    );

    const udisksInterfacesAdded = Rx.Observable.fromEvent(
      objectManager,
      'InterfacesAdded',
      (objectPath, interfaceMap) => ({ objectPath, interfaceMap })
    );
    /*const subscription = */udisksInterfacesAdded
      .filter(eventObjectPathIsUdiskJob)
      .filter(jobIsFsMount)
      .flatMap(createFsMountObservable)
      .filter(filesystemMountObservableIsKindleDrive)
      .flatMap(addKindleDriveSerialToFsMountObservable)
      .subscribe(handleKidleFsMount);
  }
  catch (ex) {
    log.error(ex);
    throw ex;
  }
}());

async function tryGetRepoHeadCommit(repo) {
  let headCommit;
  try {
    const head = await git.Reference.nameToId(repo, 'HEAD');
    headCommit = await repo.getCommit(head);
  }
  catch (ex) {
    headCommit = null;
  }

  return headCommit;
}

async function commitClippingsToRepo(clippings, serial, repoPath) {
  const author = git.Signature.now('kindle-clipping-sync',
    'kindle@clipping.sync');
  const committer = git.Signature.now('kindle-clipping-sync',
    'kindle@clipping.sync');
  try {
    const repo = await git.Repository.open(repoPath);
    await fse.ensureDir(path.join(repo.workdir(), serial));
    await fse.writeFile(path.join(repo.workdir(), serial, 'clippings.txt'), clippings);

    // FIXME: use this in the future
    // const index = await repo.refreshIndex();
    const index = await repo.openIndex();
    index.read(1);
    // /FIXME

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
        parent ? [parent] : []
      );
      return commitId;
    }
  }
  catch (ex) {
    log.warn(ex);
  }
  return undefined;
}

/**
 * [handleKidleFsMount description]
 * @param  {string} options.serial     [description]
 * @param  {string} options.drive      [description]
 * @param  {string} options.mountPoint [description]
 */
async function handleKidleFsMount({ serial, drive, mountPoint }) {
  const clippingsFilename = 'My Clippings.txt';
  const clippingsPath = path.join(mountPoint, 'documents', clippingsFilename);

  log.info(`serial: ${serial}\nmountPoint: ${mountPoint}\ndrive: ${drive}`);
  try {
    await fse.access(clippingsPath, fse.R_OK);
    const clippings = await fse.readFile(clippingsPath, 'utf8');
    const commitId = await commitClippingsToRepo(clippings, serial, REPO_PATH);
    log.info(`new commit: ${commitId}`);
    if (commitId) {
      libnotify.notify('Added new clippings to repository', {
        title: 'kindle-clipping-sync',
        image: ICON_PATH,
      });
    }
    else {
      libnotify.notify('No new clippings to add', {
        title: 'kindle-clipping-sync',
        image: ICON_PATH,
      });
    }
  }
  catch (ex) {
    log.warn(ex);
  }
}

function eventObjectPathIsUdiskJob({ objectPath }) {
  const objectPathBeginsWith = '/org/freedesktop/UDisks2/jobs/';

  return objectPath.indexOf(objectPathBeginsWith) !== -1;
}

function jobIsFsMount({ interfaceMap }) {
  const targetOperation = 'filesystem-mount';
  const { operation } = dbusUtils
    .getJobProperties('Operation', interfaceMap[0]);

  return operation === targetOperation;
}

/**
 * [filesystemMountObservableIsKindleDrive description]
 * @param  {{drive: string}} options.drive drive
 * @return {bool}
 */
function filesystemMountObservableIsKindleDrive({ drive }) {
  const kindleRegEx = /^.*\/Kindle_Internal_Storage_[A-Z|0-9]*$/;

  return kindleRegEx.test(drive);
}

function addKindleDriveSerialToFsMountObservable({ drive, mountPoint }) {
  const kindleRegEx = /^.*\/Kindle_Internal_Storage_([A-Z|0-9]*)$/;
  const [, serial] = kindleRegEx
    .exec(drive);

  return Rx.Observable.of({
    serial,
    drive,
    mountPoint,
  });
}

async function createFsMountObservable({ interfaceMap }) {
  const { objects } = dbusUtils
    .getJobProperties('Objects', interfaceMap[0]);

  const propsInterface =
    await getUdisksInterface(objects[0], 'org.freedesktop.DBus.Properties');

  // eslint-disable-next-line new-cap
  const getDbusInterfaceProp = promisify((o, p, cb) => propsInterface.Get(o, p, cb));

  let res;
  try {
    const [mountPoints, drive] = await Promise.all([
      getDbusInterfaceProp('org.freedesktop.UDisks2.Filesystem', 'MountPoints'),
      getDbusInterfaceProp('org.freedesktop.UDisks2.Block', 'Drive'),
    ]);
    const mountPoint = R.compose(
      R.toString,
      dbusUtils.getDbusBuffer,
      R.head,
      dbusUtils.getDbusPropertyValue
    )(mountPoints);

    log.info(JSON.stringify(dbusUtils.getDbusPropertyValue(drive), null, 2));
    log.info(mountPoint);
    res = {
      drive: dbusUtils.getDbusPropertyValue(drive),
      mountPoint,
    };
  }
  catch (ex) {
    log.error(ex);
    throw ex;
  }

  return res;
}
