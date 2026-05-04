export interface SecretStorageService {
  saveMountKey(profileId: string, keyRef: string): Promise<void>;
  deleteMountKey(profileId: string): Promise<void>;
  getMountKey(profileId: string): Promise<string | null>;
  saveDirectoryRegistration(dirPath: string): Promise<void>;
  getDirectoryRegistrations(): Promise<string[]>;
  deleteDirectoryRegistration(dirPath: string): Promise<void>;
}
