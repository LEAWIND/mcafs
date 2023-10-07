import { MinecraftAssetsFileSystem } from './mcafs';
import { FileSystem, FtpConnection } from 'ftp-srv';

export class FrpSrvAdapter extends FileSystem {
	constructor(public connection: FtpConnection, public mcafs: MinecraftAssetsFileSystem) {
		super(connection, { root: '', cwd: '' });
	}
	public currentDirectory() {
		return this.mcafs.currentDirectory();
	}
	public get(fileName: string) {
		return this.mcafs.get(fileName);
	}
	public list(pth: string) {
		return this.mcafs.list(pth);
	}
	public chdir(fname: string = '.') {
		return this.mcafs.chdir(fname);
	}
	public read(fileName: string, { start }: { start?: number; }) {
		return this.mcafs.read(fileName, { start });
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
