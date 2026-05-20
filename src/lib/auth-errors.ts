import { CredentialsSignin } from "@auth/core/errors";

export class PendingApprovalError extends CredentialsSignin {
  code = "pending_approval";
}

export class RejectedAccountError extends CredentialsSignin {
  code = "rejected_account";
}
