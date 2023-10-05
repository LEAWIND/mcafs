# Minecraft Assets FTP Server

一个用于访问 .minecraft/assets 目录的 FTP 服务器

## 喵？

Minecraft 的一些资源文件，例如音乐、音效、语言等储存在 .minecraft/assets 中，但这些文件的组织形式令人难以直接访问。

## 安装

```bash
$> npm install mcafs -g
```

## 使用方法

执行

```bash
$> mcafs
```

输出示例

```bash
$> mcafs
[2023-10-05T12:24:32.942] [INFO] MCAFS - Minecraft Assets Directory: C:\Users\LEAWIND\AppData\Roaming\.minecraft\assets
[2023-10-05T12:24:32.983] [INFO] MCAFS - FTP Server is starting at ftp://localhost:21/
```

使用任意 FTP 客户端即可访问 `ftp://localhost:21`



## 命令行参数

| flags                        | default                   | description      | choices                                        |
| ---------------------------- | ------------------------- | ---------------- | ---------------------------------------------- |
| -v --version                 |                           | 显示版本号       |                                                |
| -h --help                    |                           | 显示命令帮助     |                                                |
| -d --assertsDir \<assetsDir> | 默认.minecraft/assets位置 | 自定义assets位置 |                                                |
| -p --port \<port>            | 21                        | FTP 端口号       |                                                |
| -l --logLevel \<logLevel>    | info                      | 日志级别         | all,trace,debug,info,warn,error,fatal,mark,off |

### 其他

<del>windows资源管理器卡得抠脚</del>，建议用 FileZilla 等客户端访问FTP服务器。
