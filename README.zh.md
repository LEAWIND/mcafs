| [English](README.md) | 中文 |
| -------------------- | ---- |

# Minecraft Assets FTP Server

一个 FTP 服务器，专门用于访问和 Minecraft 游戏中的`.minecraft/assets`目录，用户可以通过 FTP 客户端轻松管理这些资源文件。

## 安装

```sh
npm i -g mcafs
```

## 使用方法

```sh
mcafs -u localhost:2023
```

使用任意 FTP 客户端即可访问 `ftp://localhost:2023`

## 命令行选项

| flags                        | 默认值                     | 描述                                                                     | 可选项                                         |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| -v --version                 |                            | 显示版本号                                                               |                                                |
| -h --help                    |                            | 显示命令帮助                                                             |                                                |
| -d --assertsDir \<assetsDir> | 默认.minecraft/assets 路径 | 自定义 assets 路径                                                       |                                                |
| -u --url \<url>              |                            | URL，例如 ftp://0.0.0.0:2023。若指定了此项，则 addr 和 port 选项将被忽略 |                                                |
| -a --addr \<addr>            | 127.0.0.1                  | IP 地址                                                                  |                                                |
| -p --port \<port>            | 21                         | FTP 端口号                                                               |                                                |
| -l --logLevel \<logLevel>    | info                       | 日志级别                                                                 | all,trace,debug,info,warn,error,fatal,mark,off |
