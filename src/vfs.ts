import path from "path";

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
	 * 
	 * 如果文件已经存在，则覆盖，返回被覆盖的旧文件
	 * TODO overwrite
	 */
	makeFile(vpath: string, vfile: VirtualFile): VirtualFile | null {
		const { dir, base } = path.posix.parse(vpath);
		const parentDir = dir ? this.makeDir(dir) : this;
		return parentDir._makeFile(base, vfile);
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
