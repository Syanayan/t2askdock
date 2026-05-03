export type OsFileAccessResult = {
  exists: boolean;
  readable: boolean;
  writable: boolean;
};

export interface OsFileAccessChecker {
  check(filePath: string): Promise<OsFileAccessResult>;
  checkDirectory(dirPath: string): Promise<{ exists: boolean; readable: boolean }>;
  listSqliteFiles(dirPath: string): Promise<string[]>;
}
