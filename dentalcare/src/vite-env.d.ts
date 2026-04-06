/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_UPI_PAY_BASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
