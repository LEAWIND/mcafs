#!/usr/bin/env node

import os from 'os';
import fs from "fs";
import uuid from 'uuid';
import log4js from "log4js";
import path from "path";

import { FtpSrv, FileSystem } from 'ftp-srv';

import { IndexdObject, IndexJson } from './assets_types';

const logger = log4js.getLogger("MCAFS");

/**
 * 虚拟文件系统中的节点
 */
export class VirtualNode {
	constructor(
		public parent: VirtualDirectory | null = null,
		public name: string = 'untitled',
	) {
		if (!VirtualNode.isNameValid(name)) {
			throw new Error(`Invalid file name:${name}`);
		}
	}
	getPath(): string {
		return this.parent === null
			? `/`
			: path.posix.join(this.parent.getPath(), this.name);
	}
	static isNameValid(name: string): boolean {
		return /[^\\\/:*?"<>|]+/.test(name) && !/(^\s.*)|(.*\s$)|(^\.\.?$)/.test(name);
	}
}

/**
 * 虚拟目录节点
 */
export class VirtualDirectory extends VirtualNode {
	#children: { [key: string]: VirtualNode; } = {};
	/**
	 * 将路径切分为节点名数组
	 */
	private splitPath(p: string): string[] {
		return p
			.replace(/\\/g, '/')	// 替换反斜杠为正斜杠
			.replace(/\/+/g, '/')	// 删除连续的斜杠
			.replace(/(^\/)|(\/$)/g, '')	// 删除开头结尾的斜杠
			.split('/')	// 按斜杠切分
			.map(s => s.trim());	// 删除空字符串
	}

	private _getMember(name: string): VirtualNode | null {
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
	private hasChild(name: string): boolean {
		return name in this.#children;
	}
	private _hasChildDir(name: string): boolean {
		return name in this.#children && (this.#children[name] instanceof VirtualDirectory);
	}
	private _hasChildFile(name: string): boolean {
		return name in this.#children && (this.#children[name] instanceof VirtualFile);
	}
	/**
	 * 创建子目录
	 * 
	 * @param name 子目录名
	 * @returns 新创建的子目录
	 */
	private _makeChildDir(name: string): VirtualDirectory {
		const member = this._getMember(name);
		if (member === null) {
			return this.#children[name] = new VirtualDirectory(this, name);
		} else if (member instanceof VirtualFile) {
			throw new Error(`Cannot make directory since file already exists: ${name}`);
		} else if (member instanceof VirtualDirectory) {
			return member;
		} else {
			throw new Error(`Unexpected error!`);
		}
	}
	/**
	 * 创建子文件
	 * 
	 * @param name 子文件名
	 * @param vfile 虚拟文件
	 * 
	 * @returns 被覆盖的旧文件
	 */
	private _makeFile(name: string, vfile: VirtualFile): VirtualFile | null {
		const member = this._getMember(name);
		if (member === null) {
			this.#children[name] = vfile;
			vfile.parent = this;
			vfile.name = name;
			return null;
		} else if (member instanceof VirtualFile) {
			this.#children[name] = vfile;
			vfile.parent = this;
			vfile.name = name;
			return member;
		} else if (member instanceof VirtualDirectory) {
			throw new Error(`Cannot make file since directory exists: ${name}`);
		} else {
			throw new Error(`Unexpected error!`);
		}
	}

	/**
	 * 获取子节点列表
	 */
	private _getChildNodeList() {
		return Object.values(this.#children);
	}
	/**
	 * @param vpath 虚拟路径
	 * 
	 * @returns 节点或 null
	 */
	get(vpath: string): VirtualNode | null {
		if (vpath === '/') vpath = '.';
		let node: VirtualNode = this;
		for (let name of this.splitPath(vpath)) {
			if (node instanceof VirtualFile) {
				return null;
			} else if (node instanceof VirtualDirectory) {
				const member = node._getMember(name);
				if (member === null)
					return null;
				node = member;
			}
		}
		return node;
	}
	hasDir(vpath: string): boolean {
		return this.get(vpath) instanceof VirtualDirectory;
	}
	hasFile(vpath: string): boolean {
		return this.get(vpath) instanceof VirtualFile;
	}
	/**
	 * 递归创建子目录
	 */
	makeDir(vpath: string): VirtualDirectory {
		let dir: VirtualDirectory = this;
		for (let dname of this.splitPath(vpath)) {
			dir = dir._makeChildDir(dname);
		}
		return dir;
	}
	/**
	 * 递归创建子文件
	 */
	makeFile(vpath: string, vfile: VirtualFile) {
		const { dir, base } = path.posix.parse(vpath);
		const parentDir = dir ? this.makeDir(dir) : this;
		parentDir._makeFile(base, vfile);
		return vfile;
	}
	/**
	 * 获取子节点列表
	 */
	getChildNodeList(vpath: string) {
		const vdir = this.get(vpath)!;
		if (vdir instanceof VirtualDirectory) {
			return vdir._getChildNodeList();
		} else {
			throw new Error(`Not a directory at ${vpath}\n\t${vdir}`);
		}
	}

	toString() {
		return `VirtualDirectory<${this.getPath()}>`;
	}
};

/**
 * 虚拟文件
 */
export class VirtualFile extends VirtualNode {
	constructor(
		public hash: string,
		public size: number,
	) {
		super();
	}
	toString() {
		return `VirtualFile<${this.getPath()}>`;
	}
}

export class McafsStats implements fs.StatsBase<number> {
	public isFile(): boolean {
		return this.is_file;
	}
	public isDirectory(): boolean {
		return !this.is_file;
	}
	public isBlockDevice(): boolean {
		throw new Error('Method not implemented.');
	}
	public isCharacterDevice(): boolean {
		throw new Error('Method not implemented.');
	}
	public isSymbolicLink(): boolean {
		return false;
	}
	public isFIFO(): boolean {
		throw new Error('Method not implemented.');
	}
	public isSocket(): boolean {
		throw new Error('Method not implemented.');
	}
	public dev: number;
	public ino: number;
	public mode: number;
	public nlink: number;
	public uid: number;
	public gid: number;
	public rdev: number;
	public size: number;
	public blksize: number;
	public blocks: number;
	public atimeMs: number;
	public mtimeMs: number;
	public ctimeMs: number;
	public birthtimeMs: number;
	public atime: Date;
	public mtime: Date;
	public ctime: Date;
	public birthtime: Date;

	private is_file: boolean = false;

	constructor(stats: fs.Stats) {
		this.dev = stats.dev;
		this.ino = stats.ino;
		this.mode = stats.mode;
		this.nlink = stats.nlink;
		this.uid = stats.uid;
		this.gid = stats.gid;
		this.rdev = stats.rdev;
		this.size = stats.size;
		this.blksize = stats.blksize;
		this.blocks = stats.blocks;
		this.atimeMs = stats.atimeMs;
		this.mtimeMs = stats.mtimeMs;
		this.ctimeMs = stats.ctimeMs;
		this.birthtimeMs = stats.birthtimeMs;
		this.atime = stats.atime;
		this.mtime = stats.mtime;
		this.ctime = stats.ctime;
		this.birthtime = stats.birthtime;
		this.is_file = stats.isFile();
	}
}

/**
 * MC 资产文件系统
 */
export class MinecraftAssetsFileSystem extends FileSystem {
	// 虚拟文件系统根目录
	private vfs: VirtualDirectory;
	// 当前虚拟目录
	private currentVdir: VirtualDirectory;
	// 当前虚拟目录路径
	private currentVpath;

	// 索引
	private indices: Record<string, IndexJson>;

	constructor(
		connection: any,
		private assetsDir: string,
		private cannotWrite = true,
	) {
		super(connection, { root: '', cwd: '' });

		if (!(fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory())) {
			throw new Error(`Assets directory does not exist: ${assetsDir}`);
		}

		this.vfs = new VirtualDirectory(null, "root");
		this.currentVpath = "/";
		this.currentVdir = this.vfs;

		/**
		 * 加载索引文件，生成虚拟文件系统
		 */
		this.indices = {};
		for (const indexFileName of fs.readdirSync(this.indicesRealDir)) {
			if (path.extname(indexFileName) === ".json") {
				const indexFileBaseName = path.basename(indexFileName, path.extname(indexFileName));
				const indexFileRealPath = path.join(this.indicesRealDir, indexFileName);
				const index: IndexJson = JSON.parse(fs.readFileSync(indexFileRealPath, 'utf-8')) as IndexJson;
				this.indices[indexFileBaseName] = index;
				// 索引对应的虚拟目录
				const indexVdir = this.vfs.makeDir(indexFileBaseName);
				// 遍历索引文件，生成虚拟文件
				for (let vpath in index.objects) {
					logger.trace(`Loading index ${indexFileName}`);
					const obj: IndexdObject = index.objects[vpath];
					const vfile = new VirtualFile(obj.hash, obj.size);
					indexVdir.makeFile(vpath, vfile);
				}
			}
		}
		logger.trace(`Indices are build.`);
	}


	public get indicesRealDir() {
		return path.join(this.assetsDir, 'indexes');
	}
	public get objectsRealDir() {
		return path.join(this.assetsDir, 'objects');
	}
	public get skinsRealDir() {
		return path.join(this.assetsDir, 'skins');
	}
	/**
	 * 获取文件hash对应的真实路径
	 */
	private getRealPathOfHash(hash: string) {
		return path.join(this.objectsRealDir, hash.slice(0, 2), hash);
	}
	/**
	 * 虚拟路径：将相对路径解析为绝对路径
	 */
	private resolvePath(vpath: string) {
		if (vpath[0] === '/') {
			return vpath;
		} else {
			return path.posix.join(this.currentVpath, vpath);
		}
	}

	public currentDirectory(): string {
		return this.currentVpath;
	}
	/**
	 * TODO
	 * Returns a file stat object of file or directory
	 * Used in: LIST, NLST, STAT, SIZE, RNFR, MDTM
	 */
	public async get(fileName: string): Promise<fs.Stats> {
		const vpath = this.resolvePath(fileName);
		const vfile = this.vfs.get(vpath);
		let stats: fs.Stats;
		if (vfile instanceof VirtualFile) {
			stats = new McafsStats(fs.statSync(this.getRealPathOfHash(vfile.hash!)));
		} else if (vfile instanceof VirtualDirectory) {
			stats = new McafsStats(fs.statSync(this.assetsDir));
		} else {
			throw new Error(`File not exists in vfs: ${vpath}`);
		}
		return stats;
	}
	/**
	 * Returns array of file and directory stat objects
	 * Used in: LIST, NLST, STAT
	 */
	public async list(pth: string) {
		const vpath = this.resolvePath(pth);
		const statList = this.vfs.getChildNodeList(vpath).map(child => {
			const stat = child instanceof VirtualDirectory
				? fs.statSync(this.assetsDir)
				: fs.statSync(this.getRealPathOfHash((child as VirtualFile).hash!));
			(stat as any).name = (child as VirtualNode).name;
			return stat;
		});
		return statList;
	}
	/**
	 * Returns new directory relative to current directory
	 * Used in: CWD, CDUP
	 */
	public async chdir(fname: string = '.') {
		const vpath = this.resolvePath(fname);
		const newVDir = this.vfs.get(vpath)!;
		if (newVDir instanceof VirtualDirectory) {
			this.currentVdir = newVDir;
			return this.currentVpath = vpath;
		} else {
			throw new Error(`Not a directory: ${vpath}`);
		}
	}

	/**
	 * Returns a readable stream
	 * Options:
	 * start if set, specifies the byte offset to read from
	 * Used in: RETR
	 */
	public async read(fileName: string, { start }: { start?: number; }) {
		const vpath = this.resolvePath(fileName);
		const vfile = this.vfs.get(vpath)!;
		if (vfile instanceof VirtualFile) {
			// vfile.hash
			const realPath = this.getRealPathOfHash(vfile.hash!);
			const stream = fs.createReadStream(realPath, { flags: 'r', start });
			return { stream, vpath };
		} else {
			throw new Error(`Not a file at ${vpath}: ${vfile}`);
		}
	}
	/**
	 * Returns a writable stream
	 * Options:
	 * append if true, append to existing file
	 * start if set, specifies the byte offset to write to
	 * Used in: STOR, APPE
	 */
	public async write(fileName: string, { append, start }: { append?: boolean, start?: number; }) {
		const vpath = this.resolvePath(fileName);
		if (this.cannotWrite)
			throw new Error(`This file system is readonly`);
	}

	/**
	 * Returns a path to a newly created directory
	 * Used in: MKD
	 */
	public async mkdir(fname: string) { }

	/**
	 * Delete a file or directory
	 * Used in: DELE
	 */
	public async delete(vpath: string) {
		if (this.cannotWrite)
			throw new Error(`This file system is readonly`);
	}

	/**
	 * Renames a file or directory
	 * Used in: RNFR, RNTO
	 */
	public async rename(from: string, to: string) {
		if (this.cannotWrite)
			throw new Error(`This file system is readonly`);
	}

	/**
	 * Modifies a file or directory's permissions
	 * Used in: SITE CHMOD
	 */
	public async chmod(vpath: string) {
		if (this.cannotWrite)
			throw new Error(`This file system is readonly`);
	}

	/**
	 * Returns a unique file name to write to. Client requested filename available if you want to base your function on it.
	 * Used in: STOU
	 */
	public getUniqueName(fileName: string): string {
		console.warn("[mcafs]", "getUniqueName", fileName);
		return fileName;
	}

	/**
	 * 获取 .assets 目录的默认路径
	 */
	public static getDefaultRoot() {
		if (os.type() === 'Windows_NT') {
			return path.win32.join(process.env.APPDATA!, '.minecraft/assets');
		} else {
			return path.posix.join(os.homedir(), '.minecraft/assets');
		}
	}
}
