import { invoke } from "@tauri-apps/api/core";
import type { DirListing } from "../../types/sftp";

export const sftpCommands = {
  openSftpSession: (serverId: string, sessionId: string) =>
    invoke<void>("open_sftp_session", { serverId, sessionId }),

  closeSftpSession: (sessionId: string) =>
    invoke<void>("close_sftp_session", { sessionId }),

  listSftpDir: (sessionId: string, path: string) =>
    invoke<DirListing>("list_sftp_dir", { sessionId, path }),

  mkdirSftp: (sessionId: string, path: string) =>
    invoke<void>("mkdir_sftp", { sessionId, path }),

  deleteSftp: (sessionId: string, path: string) =>
    invoke<void>("delete_sftp", { sessionId, path }),

  renameSftp: (sessionId: string, from: string, to: string, overwrite = false) =>
    invoke<void>("rename_sftp", { sessionId, from, to, overwrite }),

  uploadSftpFile: (sessionId: string, localPath: string, remotePath: string, overwrite = false) =>
    invoke<void>("upload_sftp_file", { sessionId, localPath, remotePath, overwrite }),

  downloadSftpFile: (sessionId: string, remotePath: string, localPath: string, overwrite = false) =>
    invoke<void>("download_sftp_file", { sessionId, remotePath, localPath, overwrite }),

  cancelSftpTransfer: (sessionId: string) =>
    invoke<void>("cancel_sftp_transfer", { sessionId }),

  touchSftpFile: (sessionId: string, path: string) =>
    invoke<void>("touch_sftp_file", { sessionId, path }),

  chmodSftp: (sessionId: string, path: string, mode: number) =>
    invoke<void>("chmod_sftp", { sessionId, path, mode }),

  openSftpEdit: (sessionId: string, path: string) =>
    invoke<string>("open_sftp_edit", { sessionId, path }),

  closeSftpEdit: (sessionId: string, remotePath: string) =>
    invoke<void>("close_sftp_edit", { sessionId, remotePath }),

  copySftpFile: (sessionId: string, src: string, dest: string, overwrite = false) =>
    invoke<void>("copy_sftp_file", { sessionId, src, dest, overwrite }),

  crossCopySftpFiles: (srcSessionId: string, srcPaths: string[], dstSessionId: string, dstDir: string, overwrite = false) =>
    invoke<void>("cross_copy_sftp_file", { srcSessionId, srcPaths, dstSessionId, dstDir, overwrite }),

  downloadSftpAsZip: (sessionId: string, remotePaths: string[], localPath: string) =>
    invoke<void>("download_sftp_as_zip", { sessionId, remotePaths, localPath }),

  unzipSftpFile: (sessionId: string, remoteZipPath: string, remoteDir: string) =>
    invoke<void>("unzip_sftp_file", { sessionId, remoteZipPath, remoteDir }),
};
