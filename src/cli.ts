#!/usr/bin/env node

import { program, Option } from 'commander';
import { FtpSrv } from 'ftp-srv';
import log4js from "log4js";

import { MinecraftAssetsFileSystem } from './mcafs';
import { FrpSrvAdapter } from './frp-srv-adapter';


const logger = log4js.getLogger("MCAFS");

program
	.name("mcafs")
	.description(`An FTP server dedicated to accessing the .minecraft/assets directory in Minecraft games, allowing users to easily manage these resource files via an FTP client.`)
	.version("1.1.0", '-v --version', "Show version number")
	.helpOption('-h --help', 'Show this help')

	.option('-u --url <url>', 'URL, e.g., ftp://0.0.0.0:2023. If specified, addr and port options are ignored')
	.option('-d --assetsDir <assetsDir>', 'Customizes the assets directory location', MinecraftAssetsFileSystem.getDefaultRoot())
	.option('-a --addr <addr>', 'IP address', 'localhost')
	.option('-p --port <port>', 'FTP port number', '21')
	.addOption(new Option('-l --logLevel <logLevel>', 'Log level').choices(['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']).default('info'));

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

const mcafs = new MinecraftAssetsFileSystem(opts.assetsDir);

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
	const adapter = new FrpSrvAdapter(connection, mcafs);
	return resolve({ fs: adapter, root: '/', cwd: '/', });
	// return reject(new errors.GeneralError('Invalid username or password', 401));
});
ftpServer.on('disconnect', ({ connection, id }) => {
	logger.info(`Logout from ${connection.ip}`, `\tClient ID=${id}`);
});

// 开始监听端口
ftpServer.listen().then(() => {
	logger.info(`FTP Server is starting at ftp://${opts.addr}:${opts.port}/`);
});
