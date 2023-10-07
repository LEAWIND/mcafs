| English | [中文](README.zh.md) |
| ------- | -------------------- |

# Minecraft Assets FTP Server

An FTP server dedicated to accessing the `.minecraft/assets` directory in Minecraft games, allowing users to easily manage these resource files via an FTP client.

## Installation

```sh
npm i -g mcafs
```

## Usage

```sh
mcafs -u localhost:2023
```

Access `ftp://localhost:2023` using any FTP client.

## Command Line Options

| flags                        | Default                  | Description                                                                    | Options                                        |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| -v --version                 |                          | Display version number                                                         |                                                |
| -h --help                    |                          | Display command help                                                           |                                                |
| -d --assertsDir \<assetsDir> | Default.minecraft/assets | Customizes the assets directory location                                       |                                                |
| -u --url \<url>              |                          | URL, e.g., ftp://0.0.0.0:2023. If specified, addr and port options are ignored |                                                |
| -a --addr \<addr>            | 127.0.0.1                | IP address                                                                     |                                                |
| -p --port \<port>            | 21                       | FTP port number                                                                |                                                |
| -l --logLevel \<logLevel>    | info                     | Log level                                                                      | all,trace,debug,info,warn,error,fatal,mark,off |
