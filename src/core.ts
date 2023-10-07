#!/usr/bin/env node

import os from 'os';
import fs from "fs";
import log4js from "log4js";
import path from "path";

import { FileSystem } from 'ftp-srv';

import { VirtualNode, VirtualDirectory, VirtualFile } from './vfs';
import { IndexdObject, IndexJson } from './assets_types';

const logger = log4js.getLogger("MCAFS");

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
