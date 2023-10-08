import fs from 'fs';
import path from 'path';

import { McafsStats, MinecraftAssetsFileSystem } from './mcafs';
import { FileSystem, FtpConnection } from 'ftp-srv';

export class FrpSrvAdapter extends FileSystem {
	// 当前虚拟目录路径
	private currentVpath: string;
	/**
	 * 虚拟路径：将相对路径解析为绝对路径
	 */
	private resolvePath(rvpath: string): string {
		if (rvpath[0] === '/') {
			return rvpath;
		} else {
			return path.posix.join(this.currentVpath, rvpath);
		}
	}
	constructor(public connection: FtpConnection, public mcafs: MinecraftAssetsFileSystem) {
		super(connection, { root: '', cwd: '' });
		this.currentVpath = "/";
	}
	public currentDirectory(): string {
		return this.currentVpath;
	}
	public async get(rvpath: string): Promise<fs.Stats> {
		const vpath = this.resolvePath(rvpath);
		return this.mcafs.get(vpath);
	}
	public async list(rvpath: string): Promise<McafsStats[]> {
		const vpath = this.resolvePath(rvpath);
		return this.mcafs.list(vpath);
	}
	public async chdir(rvpath: string = '.'): Promise<string> {
		const vpath = this.resolvePath(rvpath);
		if (!(await this.mcafs.get(vpath)).isDirectory()) {
			throw new Error(`Not a directory: ${vpath}`);
		}
		this.currentVpath = vpath;
		return vpath;
	}
	public async read(rvpath: string, { start }: { start?: number; }): Promise<any> {
		const vpath = this.resolvePath(rvpath);
		return this.mcafs.read(vpath, { start });
	}

	/**
	 * Returns a writable stream
	 * Options:
	 * append if true, append to existing file
	 * start if set, specifies the byte offset to write to
	 * Used in: STOR, APPE
	 */
	public async write(fileName: string, { append, start }: { append?: boolean, start?: number; }): Promise<void> {
		throw new Error(`This file system is readonly`);
	}

	/**
	 * Returns a path to a newly created directory
	 * Used in: MKD
	 */
	public async mkdir(fname: string): Promise<void> {
		throw new Error(`This file system is readonly`);
	}

	/**
	 * Delete a file or directory
	 * Used in: DELE
	 */
	public async delete(vpath: string): Promise<void> {
		throw new Error(`This file system is readonly`);
	}

	/**
	 * Renames a file or directory
	 * Used in: RNFR, RNTO
	 */
	public async rename(from: string, to: string): Promise<void> {
		throw new Error(`This file system is readonly`);
	}

	/**
	 * Modifies a file or directory's permissions
	 * Used in: SITE CHMOD
	 */
	public async chmod(vpath: string): Promise<void> {
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

}
