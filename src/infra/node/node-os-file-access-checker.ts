import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join } from 'node:path';
import type { OsFileAccessChecker, OsFileAccessResult } from '../../core/ports/services/os-file-access-checker.js';

export class NodeOsFileAccessChecker implements OsFileAccessChecker {
  public async check(filePath: string): Promise<OsFileAccessResult> {
    const exists = await this.canAccess(filePath, constants.F_OK);
    if (!exists) {
      return { exists: false, readable: false, writable: false };
    }
    return {
      exists: true,
      readable: await this.canAccess(filePath, constants.R_OK),
      writable: await this.canAccess(filePath, constants.W_OK)
    };
  }

  public async checkDirectory(dirPath: string): Promise<{ exists: boolean; readable: boolean }> {
    const st = await stat(dirPath).catch(() => null);
    if (!st?.isDirectory()) return { exists: false, readable: false };
    return { exists: true, readable: await this.canAccess(dirPath, constants.R_OK) };
  }

  public async listSqliteFiles(dirPath: string): Promise<string[]> {
    const entries = await readdir(dirPath);
    return entries
      .filter((name) => ['.sqlite', '.sqlite3', '.db'].includes(extname(name).toLowerCase()))
      .map((name) => join(dirPath, name));
  }

  private async canAccess(filePath: string, mode: number): Promise<boolean> {
    try {
      await access(filePath, mode);
      return true;
    } catch {
      return false;
    }
  }
}
