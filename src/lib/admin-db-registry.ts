export type AdminDbTableId =
  | "User"
  | "DownloadJob"
  | "SiteConfig"
  | "ServerSetting"
  | "SystemLog"
  | "LoginEvent"
  | "RateLimitEvent";

export type AdminDbTableDef = {
  id: AdminDbTableId;
  label: string;
  readOnly: boolean;
  allowDelete: boolean;
  editableFields: string[];
  hiddenFields: string[];
};

export const ADMIN_DB_TABLES: AdminDbTableDef[] = [
  {
    id: "User",
    label: "Users",
    readOnly: false,
    allowDelete: true,
    editableFields: [
      "name",
      "email",
      "username",
      "accountStatus",
      "locale",
    ],
    hiddenFields: ["passwordHash"],
  },
  {
    id: "DownloadJob",
    label: "Download jobs",
    readOnly: false,
    allowDelete: true,
    editableFields: ["status", "phase", "title", "formatLabel", "errorCode"],
    hiddenFields: ["filePath"],
  },
  {
    id: "SiteConfig",
    label: "Site config",
    readOnly: true,
    allowDelete: false,
    editableFields: [],
    hiddenFields: [],
  },
  {
    id: "ServerSetting",
    label: "Server settings (DB)",
    readOnly: true,
    allowDelete: false,
    editableFields: [],
    hiddenFields: [],
  },
  {
    id: "SystemLog",
    label: "System logs",
    readOnly: true,
    allowDelete: true,
    editableFields: [],
    hiddenFields: [],
  },
  {
    id: "LoginEvent",
    label: "Login events",
    readOnly: true,
    allowDelete: true,
    editableFields: [],
    hiddenFields: [],
  },
  {
    id: "RateLimitEvent",
    label: "Rate limit events",
    readOnly: true,
    allowDelete: true,
    editableFields: [],
    hiddenFields: [],
  },
];

export function getAdminDbTable(id: string): AdminDbTableDef | undefined {
  return ADMIN_DB_TABLES.find((t) => t.id === id);
}
