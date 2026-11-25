import { NextFunction, Request, Response } from 'express';
import {
  AuthPrincipal,
  AuthProviderInterface,
  ComputedSubscriptionState,
  DatabaseProviderInterface,
  SaaSRole,
  SaaSServiceError,
  SchoolTenantRecord,
} from './types';
import { evaluateSubscriptionState } from './subscriptionService';
import { toFirebaseAdminServiceError } from './providers/firebaseProvider';

export interface AuthenticatedRequest extends Request {
  principal?: AuthPrincipal;
  tenantSchool?: SchoolTenantRecord;
  subscriptionState?: ComputedSubscriptionState;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export function createSaaSMiddleware(
  auth: AuthProviderInterface,
  db: DatabaseProviderInterface,
  nowProvider: () => Date = () => new Date()
) {
  const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Authentication required. Missing Bearer token.',
        });
      }

      const principal = await auth.verifyIdToken(token);

      // Re-check server-side master admin registry & saas_users status in parallel if not already marked by custom claim
      if (!principal.isMasterAdmin) {
        const [isDbMaster, userRecord] = await Promise.all([
          db.isMasterAdminUidOrEmail(principal.uid, principal.email),
          db.getSaaSUserByUid(principal.uid).catch((dbErr: any) => {
            if (
              dbErr instanceof SaaSServiceError &&
              (dbErr.code === 'ADMIN_SDK_UNAVAILABLE' ||
                dbErr.code === 'ADMIN_IAM_PERMISSION_DENIED' ||
                dbErr.code === 'ADMIN_CREDENTIAL_INVALID')
            ) {
              return null;
            }
            if (toFirebaseAdminServiceError(dbErr)) {
              return null;
            }
            throw dbErr;
          }),
        ]);

        if (isDbMaster) {
          principal.isMasterAdmin = true;
          principal.schoolRole = 'master_admin';
        } else if (userRecord) {
          if (userRecord.status === 'disabled') {
            return res.status(403).json({
              success: false,
              code: 'ACCOUNT_DISABLED',
              error: 'Your user account has been disabled by your administrator.',
            });
          }
          // Enforce server-authoritative schoolId & role from claims or persisted record
          if (!principal.schoolId && userRecord.schoolId) {
            principal.schoolId = userRecord.schoolId;
          }
          if (!principal.schoolRole && userRecord.schoolRole) {
            principal.schoolRole = userRecord.schoolRole;
          }
          if (userRecord.linkedStaffId) {
            principal.linkedStaffId = userRecord.linkedStaffId;
          }
          if (userRecord.linkedStudentId) {
            principal.linkedStudentId = userRecord.linkedStudentId;
          }
          if (userRecord.phone) {
            principal.phone = userRecord.phone;
          }
        }
      }

      req.principal = principal;
      return next();
    } catch (err: any) {
      const mapped = err instanceof SaaSServiceError ? err : toFirebaseAdminServiceError(err);
      const status = mapped ? mapped.statusCode : 401;
      return res.status(status).json({
        success: false,
        code: mapped?.code || err?.code || 'UNAUTHORIZED',
        error: mapped?.message || err?.message || 'Unauthorized',
      });
    }
  };

  const requireMasterAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.principal || !req.principal.isMasterAdmin) {
      return res.status(403).json({
        success: false,
        code: 'MASTER_ADMIN_REQUIRED',
        error: 'Access denied. Only the Platform Master Admin can perform this action.',
      });
    }
    return next();
  };

  const requireActiveTenantSubscription = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const principal = req.principal;
      if (!principal) {
        return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Unauthorized' });
      }

      // Master Admin retains platform management access even if inspecting tenants
      if (principal.isMasterAdmin) {
        return next();
      }

      if (!principal.schoolId) {
        return res.status(403).json({
          success: false,
          code: 'NO_TENANT_CLAIMS',
          error: 'Your account is not assigned to any school tenant.',
        });
      }

      // Cross-tenant protection if route includes :schoolId
      const paramSchoolId = req.params?.schoolId;
      if (paramSchoolId && paramSchoolId !== principal.schoolId) {
        return res.status(403).json({
          success: false,
          code: 'CROSS_TENANT_FORBIDDEN',
          error: 'Cross-school access is strictly forbidden.',
        });
      }

      const school = await db.getSchoolById(principal.schoolId);
      if (!school) {
        return res.status(404).json({
          success: false,
          code: 'SCHOOL_NOT_FOUND',
          error: 'Assigned school record was not found.',
        });
      }

      const state = evaluateSubscriptionState(school, nowProvider());
      req.tenantSchool = school;
      req.subscriptionState = state;

      if (!state.accessAllowed) {
        const code = state.isSuspended
          ? 'SCHOOL_SUSPENDED'
          : state.isPending
          ? 'SUBSCRIPTION_PENDING'
          : 'SUBSCRIPTION_EXPIRED';
        return res.status(403).json({
          success: false,
          code,
          error:
            code === 'SCHOOL_SUSPENDED'
              ? 'This school account has been suspended by Master Admin.'
              : code === 'SUBSCRIPTION_PENDING'
              ? 'This school subscription is pending activation.'
              : 'School subscription has expired. Please renew to restore access.',
          subscription: state,
          school: {
            schoolId: school.schoolId,
            schoolName: school.schoolName,
            contactNumber: school.contactNumber,
            email: school.email,
          },
        });
      }

      return next();
    } catch (err: any) {
      if (err instanceof SaaSServiceError) {
        return res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
      }
      const iamMapped = toFirebaseAdminServiceError(err);
      if (iamMapped) {
        return res.status(iamMapped.statusCode).json({
          success: false,
          code: iamMapped.code,
          error: iamMapped.message,
        });
      }
      return res.status(500).json({
        success: false,
        code: 'SUBSCRIPTION_CHECK_FAILED',
        error: err?.message || 'Failed to validate school subscription.',
      });
    }
  };

  const requireRole = (allowedRoles: SaaSRole[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const principal = req.principal;
      if (!principal) {
        return res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Unauthorized' });
      }
      if (principal.isMasterAdmin) {
        return next();
      }
      if (!principal.schoolRole || !allowedRoles.includes(principal.schoolRole)) {
        return res.status(403).json({
          success: false,
          code: 'INSUFFICIENT_ROLE',
          error: `Role "${principal.schoolRole || 'none'}" is not permitted to perform this action.`,
        });
      }
      return next();
    };
  };

  return {
    requireAuth,
    requireMasterAdmin,
    requireActiveTenantSubscription,
    requireRole,
  };
}
