#!/usr/bin/env node

const os = require('os');
const fs = require("fs");
const uuid = require('uuid');
const bunyan = require('bunyan');
const log4js = require("log4js");
const path = require("path").posix;
const { FtpSrv, FileSystem } = require('ftp-srv');
const errors = require('ftp-srv/src/errors');
const { program, Option } = require("commander");

const logger = log4js.getLogger("MCAFS");

function defineProgram() {
	program
		.name("mcafs")
		.description(`一个用于访问 .minecraft/assets 目录的 FTP 服务器\n任意用户名和密码均可登录`)
		.version("1.0.1", null, "显示版本号")
		.helpOption('-h --help', '显示命令帮助')
		.addHelpText('afterAll', "推荐使用的FTP客户端：FileZilla");
	program
		.option('-d --assetsDir <assetsDir>', '.minecraft/assets 目录路径', MinecraftAssetsFileSystem.getDefaultRoot())
		.option('-u --url <url>', 'URL，例如ftp://0.0.0.0:2023。若指定了此项，则addr和port选项将被忽略')
		.option('-a --addr <addr>', 'IP 地址', '127.0.0.1')
		.option('-p --port <port>', 'FTP 端口号', 21)
		.addOption(new Option('-l --logLevel <logLevel>', '日志级别').choices(['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('info'));
	program.parse();
}

/**
 * 虚拟文件系统中的节点
 */
class VirtualNode {
	parent = null;
	name = 'untitled';

	constructor({ parent, name } = { parent: null, name: 'untitled' }) {
		if (!VirtualNode.isNameValid(name)) {
			throw new errors.FileSystemError(`Invalid file name:${name}`);
		}
		this.name = name;
		this.parent = parent;
	}
	getPath() {
		return this.parent === null
			? `/`
			: path.join(this.parent.getPath(), this.name);
	}
	static isNameValid(name) {
		return /[^\\\/:*?"<>|]+/.test(name) && !/(^\s.*)|(.*\s$)|(^\.\.?$)/.test(name);
	}
}

/**
 * 虚拟目录节点
 */
class VirtualDirectory extends VirtualNode {
	#children = {};
	/**
	 * 将路径切分为节点名数组
	 */
	#splitPath(p) {
		return p
			.replace(/\\/g, '/')
			.replace(/\/+/g, '/')
			.replace(/(^\/)|(\/$)/g, '')
			.split('/')
			.map(s => s.trim());
	}

	/**
	 * 下划线开头的方法为非递归，其余默认为递归的
	 */


	_get(name) {
		if (name === '.') {
			return this;
		} else if (name === '..') {
			return this.parent;
		} else if (name in this.#children) {
			return this.#children[name];
		} else {
			return null;
		}
	}
	_hasChild(name) {
		return name in this.#children;
	}
	_hasChildDir(name) {
		return name in this.#children && (this.#children[name] instanceof VirtualDirectory);
	}
	_hasChildFile(name) {
		return name in this.#children && (this.#children[name] instanceof VirtualFile);
	}
	/**
	 * @returns directory
	 */
	_makeChildDir(name) {
		let res;
		if (this._hasChildFile(name)) {
			throw new Error(`Making directory failed`);
		} else if (this._hasChildDir(name)) {
			res = this._get(name);
		} else {
			res = this.#children[name] = new VirtualDirectory({ parent: this, name: name });
		}
		return res;
	}
	/**
	 * @returns old file or null
	 */
	_makeFile(name, vfile) {
		let oldFile = null;
		if (this._hasChildDir(name)) {
			throw new errors.FileSystemError(`Cannot make file since directory exists: ${name}`);
		} else {
			if (this._hasChildFile(name)) {
				oldFile = this.#children[name];
			}
			this.#children[name] = vfile;
			vfile.parent = this;
			vfile.name = name;
			return oldFile;
		}
	}

	_getChildNodeList() {
		return Object.values(this.#children);
	}

	get(vpath) {
		if (vpath === '/') vpath = '.';
		let dirOrFile = this;
		for (let dname of this.#splitPath(vpath)) {
			if (!(dirOrFile instanceof VirtualDirectory)) {
				return null;
			}
			dirOrFile = dirOrFile._get(dname);
		}
		return dirOrFile;
	}
	hasDir(vpath) {
		return this.get(vpath) instanceof VirtualDirectory;
	}
	hasFile(vpath) {
		return this.get(vpath) instanceof VirtualFile;
	}
	makeDir(vpath) {
		let dir = this;
		for (let dname of this.#splitPath(vpath)) {
			dir = dir._makeChildDir(dname);
		}
		return dir;
	}
	makeFile(vpath, vfile) {
		const { dir: vdir_path, base: vfname, ext: vext, name: vbasename } = path.parse(vpath);
		const parentDir = vdir_path ? this.makeDir(vdir_path) : this;
		parentDir._makeFile(vfname, vfile);
		return vfile;
	}

	getChildNodeList(vpath) {
		const vdir = this.get(vpath);
		if (vdir instanceof VirtualDirectory) {
			return vdir._getChildNodeList();
		} else {
			throw new errors.FileSystemError(`Not a directory at ${vpath}\n\t${vdir}`);
		}
	}

	constructor({ parent, name }) {
		super({ parent, name });
	}
	toString() {
		return `VirtualDirectory<${this.getPath()}>`;
	}
};

/**
 * 虚拟文件
 */
class VirtualFile extends VirtualNode {
	hash = null;
	size = null;
	constructor({ parent, name }, { hash, size }) {
		super({ parent, name });
		this.hash = hash;
		this.size = size;
	}

	toString() {
		return `VirtualFile<${this.getPath()}>`;
	}
}

/**
 * MC 资产文件系统
 */
class MinecraftAssetsFileSystem extends FileSystem {
	#readonly = true;
	#root = '';
	#indexes = null;
	#currentVDirPath = '/';
	#currentVDir = null;
	// 虚拟文件系统根目录
	#vfs = null;

	get root() {
		return this._root;
	}

	/**
	 * 加载索引文件，生成虚拟文件系统
	 */
	#loadIndexes() {
		this.#indexes = {};
		// for index files in "assets/indexes/"
		for (const indexFileName of fs.readdirSync(this.#indexesDir)) {
			if (path.extname(indexFileName) !== ".json") {
				continue;
			}
			const indexFileBaseName = path.basename(indexFileName, path.extname(indexFileName));
			const indexFilePath = path.join(this.#indexesDir, indexFileName);
			this.#indexes[indexFileBaseName] = JSON.parse(fs.readFileSync(indexFilePath));
			const indexVdir = this.#vfs.makeDir(indexFileBaseName);
			// for objects in index file
			for (let vpath in this.#indexes[indexFileBaseName].objects) {
				logger.trace(`Loading index ${indexFileName}`);
				const vfile = new VirtualFile({}, this.#indexes[indexFileBaseName].objects[vpath]);
				indexVdir.makeFile(vpath, vfile);
			}
		}
	}

	get #indexesDir() {
		return path.join(this.#root, 'indexes');
	}
	get #objectsDir() {
		return path.join(this.#root, 'objects');
	}
	get #skinsDir() {
		return path.join(this.#root, 'skins');
	}
	#realPathOfHash(hashstr) {
		return path.join(this.#objectsDir, hashstr.slice(0, 2), hashstr);
	}
	#resolvePath(vpath) {
		if (vpath[0] === '/') {
			return vpath;
		} else {
			return path.join(this.#currentVDirPath, vpath);
		}
	}

	constructor(connection, { root, cwd = '/' } = {}) {
		super(connection, { root, cwd });

		this.#root = root;
		if (!(fs.existsSync(root) && fs.statSync(root).isDirectory()))
			logger.fatal(`Assets directory does not exist: ${root}`);

		this.#vfs = new VirtualDirectory({ parent: null, name: "root" });	// 初始化虚拟文件系统
		this.#currentVDirPath = "/";
		this.#currentVDir = this.#vfs;
		this.#loadIndexes();	// 加载索引文件，创建虚拟文件系统

		this.chdir(cwd);
	}

	/**
	 * Returns a string of the current working directory
	 * Used in: PWD
	*/
	async currentDirectory() {
		return this.#currentVDirPath;
	}
	/**
	 * Returns a file stat object of file or directory
	 * Used in: LIST, NLST, STAT, SIZE, RNFR, MDTM
	 */
	async get(fileName) {
		const vpath = this.#resolvePath(fileName);
		const vfile = this.#vfs.get(vpath);
		let stat;
		if (vfile instanceof VirtualFile) {
			stat = fs.statSync(this.#realPathOfHash(vfile.hash));
		} else if (vfile instanceof VirtualDirectory) {
			stat = fs.statSync(this.#root);
		} else {
			throw new Error(`File not exists in vfs: ${vpath}`);
		}
		stat.name = path.basename(vpath);
		return stat;
	}
	/**
	 * Returns array of file and directory stat objects
	 * Used in: LIST, NLST, STAT
	 */
	async list(pth) {
		const vpath = this.#resolvePath(pth);
		const statList = this.#vfs.getChildNodeList(vpath).map(child => {
			const stat = child instanceof VirtualDirectory
				? fs.statSync(this.#root)
				: fs.statSync(this.#realPathOfHash(child.hash));
			stat.name = child.name;
			return stat;
		});
		return statList;
	}
	/**
	 * Returns new directory relative to current directory
	 * Used in: CWD, CDUP
	 */
	async chdir(fname = '.') {
		const vpath = this.#resolvePath(fname);
		const newVDir = this.#vfs.get(vpath);
		if (newVDir instanceof VirtualDirectory) {
			this.#currentVDir = newVDir;
			return this.#currentVDirPath = vpath;
		} else {
			throw new errors.FileSystemError(`Not a directory: ${vpath}`);
		}
	}

	/**
	 * Returns a readable stream
	 * Options:
	 * start if set, specifies the byte offset to read from
	 * Used in: RETR
	 */
	async read(fileName, { start }) {
		const vpath = this.#resolvePath(fileName);
		const vfile = this.#vfs.get(vpath);
		if (vfile instanceof VirtualFile) {
			// vfile.hash
			const realPath = this.#realPathOfHash(vfile.hash);
			const stream = fs.createReadStream(realPath, { flags: 'r', start });
			return { stream, vpath };
		} else {
			throw new errors.FileSystemError(`Not a file at ${vpath}: ${vfile}`);
		}
	}
	/**
	 * Returns a writable stream
	 * Options:
	 * append if true, append to existing file
	 * start if set, specifies the byte offset to write to
	 * Used in: STOR, APPE
	 */
	async write(fileName, { append, start }) {
		const vpath = this.#resolvePath(fileName);
		if (this.#readonly)
			throw new errors.FileSystemError(`This file system is readonly`);

	}

	/**
	 * Returns a path to a newly created directory
	 * Used in: MKD
	 */
	async mkdir(fname) {}

	/**
	 * Delete a file or directory
	 * Used in: DELE
	 */
	async delete(path) {
		if (this.#readonly)
			throw new errors.FileSystemError(`This file system is readonly`);
	}

	/**
	 * Renames a file or directory
	 * Used in: RNFR, RNTO
	 */
	async rename(from, to) {
		if (this.#readonly)
			throw new errors.FileSystemError(`This file system is readonly`);
	}

	/**
	 * Modifies a file or directory's permissions
	 * Used in: SITE CHMOD
	 */
	async chmod(path) {
		if (this.#readonly)
			throw new errors.FileSystemError(`This file system is readonly`);
	}

	/**
	 * Returns a unique file name to write to. Client requested filename available if you want to base your function on it.
	 * Used in: STOU
	 */
	async getUniqueName(fileName) {
		return uuid.v4().replace(/\W/g, '');
	}

	/**
	 * .assets 的默认路径
	 */
	static getDefaultRoot() {
		if (os.type() === 'Windows_NT') {
			return path.win32.join(process.env.APPDATA, '.minecraft/assets');
		} else {
			return path.posix.join(os.homedir(), '.minecraft/assets');
		}
	}
}


(async () => {
	defineProgram();

	const opts = program.opts();
	opts.assetsDir = opts.assetsDir.trim();
	opts.port = ~~opts.port;

	if (opts.url) {
		opts.url = opts.url.trim();
		if (!/.*\/\/.*/.test(opts.url)) {
			opts.url = `ftp://${opts.url}`;
		}
		const url = new URL(opts.url);
		opts.port = url.port;
		opts.addr = url.hostname;
	}

	logger.level = opts.logLevel;

	logger.info(`Minecraft Assets Directory: ${opts.assetsDir}`);

	const ftpServer = new FtpSrv({
		url: `ftp://${opts.addr}:${opts.port}`,
		pasv_min: 1024,
		pasv_max: 65535,
		tls: false,
		timeout: 0,
		greeting: `Welcom to Minecraft Assets FTP Server developed by node.js`,
		anonymous: true,
		log: bunyan.createLogger({ name: 'ftp-srv', level: 100 }),
	});

	ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
		const socket = connection.commandSocket;
		logger.info(socket.remoteFamily === 'IPv6'
			? `Login  from [${socket.remoteAddress}]:${socket.remotePort}`
			: `Login  from ${socket.remoteAddress}:${socket.remotePort}`,
			`\tUsername=${username}`
		);
		const mcafs = new MinecraftAssetsFileSystem(connection, { root: opts.assetsDir, cwd: '/' });
		return resolve({ fs: mcafs, root: '/', cwd: '/', });
		// return reject(new errors.GeneralError('Invalid username or password', 401));
	});
	ftpServer.on('disconnect', ({ connection, id }) => {
		const socket = connection.commandSocket;
		logger.info(socket.remoteFamily === 'IPv6'
			? `Logout from [${socket.remoteAddress}]:${socket.remotePort}`
			: `Logout from ${socket.remoteAddress}:${socket.remotePort}`, `\tClient ID=${id}`);
	});
	ftpServer.on('closed', () => {
		logger.info(`Server is closed.`);
	});

	// 开始监听端口
	ftpServer.listen().then(() => {
		logger.info(`FTP Server is starting at ftp://${opts.addr}:${opts.port}/`);
	});
})();
