import os from 'os';
import fs from "fs";
import log4js from "log4js";
import path from "path";

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

	constructor(
		stats: fs.Stats,
		public name: string,
	) {
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
export class MinecraftAssetsFileSystem {
	// 虚拟文件系统根目录
	private vfs: VirtualDirectory;
	// 索引
	private indices: Record<string, IndexJson> = {};

	/**
	 * @param assetsDir 资产目录
	 */
	constructor(private assetsDir: string) {
		if (!(fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory())) {
			throw new Error(`Assets directory does not exist: ${assetsDir}`);
		}

		this.vfs = new VirtualDirectory(null, "root");

		/**
		 * 加载索引文件，生成虚拟文件系统
		 */
		for (const indexFileName of fs.readdirSync(this.indicesRealDir)) {
			if (path.extname(indexFileName) === ".json") {
				const indexFileBaseName = path.basename(indexFileName, path.extname(indexFileName));
				const indexFileRealPath = path.join(this.indicesRealDir, indexFileName);
				const index: IndexJson = JSON.parse(fs.readFileSync(indexFileRealPath, 'utf-8')) as IndexJson;
				this.indices[indexFileBaseName] = index;

				// 索引对应的虚拟目录
				const indexVdir = this.vfs.makeDir(indexFileBaseName);
				MinecraftAssetsFileSystem.loadIndexFile(index, indexVdir);
			}
		}
		logger.trace(`Indices are build.`);
	}

	public get indicesRealDir(): string {
		return path.join(this.assetsDir, 'indexes');
	}
	public get objectsRealDir(): string {
		return path.join(this.assetsDir, 'objects');
	}
	public get skinsRealDir(): string {
		return path.join(this.assetsDir, 'skins');
	}
	/**
	 * 获取文件hash对应的真实路径
	 */
	private getRealPathOfHash(hash: string): string {
		return path.join(this.objectsRealDir, hash.slice(0, 2), hash);
	}


	/**
	 * 获取文件 Stat
	 */
	public async get(vpath: string): Promise<fs.Stats> {
		const { base } = path.parse(vpath);
		const vfile = this.vfs.get(vpath);
		let stats: fs.Stats;
		if (vfile instanceof VirtualFile) {
			stats = new McafsStats(fs.statSync(this.getRealPathOfHash(vfile.hash)), base);
		} else if (vfile instanceof VirtualDirectory) {
			stats = new McafsStats(fs.statSync(this.assetsDir), base);
		} else {
			throw new Error(`File not exists in vfs: ${vpath}`);
		}
		return stats;
	}
	/**
	 * 获取目录下的文件信息
	 * 
	 * @param vpath 虚拟目录路径
	 */
	public async list(vpath: string): Promise<McafsStats[]> {
		return this.vfs
			.getChildNodeList(vpath)
			.map(child => new McafsStats(
				fs.statSync(child instanceof VirtualDirectory
					? this.assetsDir
					: this.getRealPathOfHash((child as VirtualFile).hash)
				),
				child.name,
			));
	}

	/**
	 * 读取文件
	 * 
	 * @param vpath 虚拟文件路径
	 */
	public async read(vpath: string, { start }: { start?: number; }): Promise<{ stream: fs.ReadStream; vpath: string; }> {
		const vfile = this.vfs.get(vpath);
		if (vfile instanceof VirtualFile) {
			const realPath = this.getRealPathOfHash(vfile.hash);
			const stream = fs.createReadStream(realPath, { flags: 'r', start });
			return { stream, vpath };
		} else {
			throw new Error(`Not a file at ${vpath}: ${vfile}`);
		}
	}
	/**
	 * 获取 .assets 目录的默认路径
	 */
	public static getDefaultRoot(): string {
		if (os.type() === 'Windows_NT') {
			const appDataDir: string = process.env.APPDATA || path.win32.join(os.homedir(), 'AppData/Roaming');
			return path.win32.join(appDataDir, '.minecraft/assets');
		} else {
			return path.posix.join(os.homedir(), '.minecraft/assets');
		}
	}
	/**
	 * 加载索引文件到指定的虚拟目录
	 * 
	 * @param index 索引
	 * @param vdir 虚拟目录
	 * @param [overwrite=true] 是否覆盖虚拟目录中已存在的文件
	 */
	public static loadIndexFile(index: IndexJson, vdir: VirtualDirectory, overwrite: boolean = true): void {
		for (let vpath in index.objects) {
			const obj: IndexdObject = index.objects[vpath];
			const vfile = new VirtualFile(obj.hash, obj.size);
			if (overwrite || !vdir.hasFile(vpath)) {
				vdir.makeFile(vpath, vfile);
			}
		}
	}
}
