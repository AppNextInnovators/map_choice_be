import { VerifyAppCheckTokenResponse } from "firebase-admin/app-check";

// Extend Express Request interface to include App Check token
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      appCheckToken?: VerifyAppCheckTokenResponse;
      uid?: string;
    }
  }
}

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Item {
  id: number;
  name: string;
  description: string;
  price: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
