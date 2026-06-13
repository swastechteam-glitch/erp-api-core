import { body, validationResult } from "express-validator";

// ✅ Validation rules
export const purchaseOrderValidationRules = [
  body("CQTApprovalDate").isISO8601().withMessage("Invalid Approval Date"),

  body("CQTCode").isInt({ min: 1 }).withMessage("Quality Test Code is require"),

  body("companyCode").isInt({ min: 1 }).withMessage("Company code is require"),
];

// ✅ Middleware to check results
export const validatePurchaseOrder = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  next();
};
