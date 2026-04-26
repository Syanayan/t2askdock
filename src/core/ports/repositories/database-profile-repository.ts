export type DatabaseProfileRecord = {
  profileId: string;
  name: string;
  path: string;
  mode: 'readWrite' | 'readOnly';
  encryptedDek: Uint8Array;
  dekWrapSalt: string;
};

export interface DatabaseProfileRepository {
  save(record: DatabaseProfileRecord): Promise<void>;
  findById(profileId: string): Promise<DatabaseProfileRecord | undefined>;
}
