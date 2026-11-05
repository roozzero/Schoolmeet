export type ClassRoomCode = '901' | '902' | '903';

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface StudentRegistrationPayload {
  firstName: string;
  lastName: string;
  phone: string;
  classCode: ClassRoomCode;
  password: string;
  passwordConfirmation: string;
}

export interface StudentRecord {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  classCode: ClassRoomCode;
  createdAt: string;
}

export interface ApiAuthResponse {
  success: boolean;
  message: string;
  student?: StudentRecord;
}
