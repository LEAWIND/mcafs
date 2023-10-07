#!/usr/bin/env node

import { program, Option } from 'commander';
import { FtpSrv } from 'ftp-srv';
import log4js from "log4js";

import { MinecraftAssetsFileSystem } from './mcafs';


const logger = log4js.getLogger("MCAFS");

program
	.name("mcafs")
	.description(`一个用于访问 .minecraft/assets 目录的 FTP 服务器\n任意用户名和密码均可登录`)
	.version("1.1.0", undefined, "显示版本号")
	.helpOption('-h --help', '显示命令帮助')
	.addHelpText('afterAll', "推荐使用的FTP客户端：FileZilla")

	.option('-u --url <url>', 'URL，例如ftp://0.0.0.0:2023。若指定了此项，则addr和port选项将被忽略')
	.option('-d --assetsDir <assetsDir>', '.minecraft/assets 目录路径', MinecraftAssetsFileSystem.getDefaultRoot())
	.option('-a --addr <addr>', 'IP 地址', '127.0.0.1')
	.option('-p --port <port>', 'FTP 端口号', '21')
	.addOption(new Option('-l --logLevel <logLevel>', '日志级别').choices(['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('info'));

program.parse();

const opts = program.opts() as {
	assetsDir: string,
	url?: string,
	addr: string,
	port: number,
	logLevel: string;
};
opts.assetsDir = opts.assetsDir.trim();
opts.port = ~~opts.port;

if (opts.url) {
	opts.url = opts.url.trim();
	if (!/.*\/\/.*/.test(opts.url)) {
		opts.url = `ftp://${opts.url}`;
	}
	const url = new URL(opts.url);
	opts.port = parseInt(url.port!);
	opts.addr = url.hostname;
}

logger.level = opts.logLevel as any;

logger.info(`Minecraft Assets Directory: ${opts.assetsDir}`);

const ftpServer = new FtpSrv({
	url: `ftp://${opts.addr}:${opts.port}`,
	pasv_min: 1024,
	pasv_max: 65535,
	tls: false,
	timeout: 0,
	greeting: `Welcom to Minecraft Assets FTP Server (mcafs)!\nAuthor: Leawind`,
	anonymous: true,
});

ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
	logger.info(`Login  from ${connection.ip}`);
	const mcafs = new MinecraftAssetsFileSystem(connection, opts.assetsDir);
	return resolve({ fs: mcafs, root: '/', cwd: '/', });
	// return reject(new errors.GeneralError('Invalid username or password', 401));
});
ftpServer.on('disconnect', ({ connection, id }) => {
	logger.info(`Logout from ${connection.ip}`, `\tClient ID=${id}`);
});

// 开始监听端口
ftpServer.listen().then(() => {
	logger.info(`FTP Server is starting at ftp://${opts.addr}:${opts.port}/`);
});
