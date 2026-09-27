import { isTauri } from '@tauri-apps/api/core';
import { browserPlatform } from './browser';
import { tauriPlatform } from './tauri';
import type { Platform } from './types';

export type { FileKind, FileStamp, FileTarget, PickedFile, Platform, SavedFile } from './types';

/** Где запущен редактор: в окне Tauri — настольная платформа, иначе браузер. */
export const platform: Platform = isTauri() ? tauriPlatform : browserPlatform;
