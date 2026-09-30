import { Capacitor, registerPlugin } from "@capacitor/core";

// Native Android plugin (android/.../iserv/IServFilesPlugin.java): browses the
// IServ app's DocumentsProvider folder the user chose once. Only exists on the tablet.
const IServFiles = Capacitor.isNativePlatform() ? registerPlugin("IServFiles") : null;

export const iservAvailable = Boolean(IServFiles);

export const chooseIservFolder = () => IServFiles.chooseFolder();

// -> { items: [{id, name, isDir, type}], rootId }; rejects with message "no-folder" before the first choice
export const listIserv = (docId) => IServFiles.list(docId ? { docId } : {});

const IMPORTABLE = /^(application\/pdf|image\/(png|jpeg))$/;
export const isImportable = (item) => IMPORTABLE.test(item.type || "");

// Reads one provider file into a File, only when it is actually imported.
export async function readIservFile(docId) {
  const { path, name, type } = await IServFiles.read({ docId });
  const blob = await (await fetch(Capacitor.convertFileSrc(path))).blob();
  return new File([blob], name, { type: type || blob.type });
}
