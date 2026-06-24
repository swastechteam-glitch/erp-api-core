import { body, validationResult } from "express-validator";

// ✅ Validation rules
export const purchaseOrderValidationRules = [
  body("approvalDate").isISO8601().withMessage("Invalid Approval Date"),

  body("cpoCode").isInt({ min: 1 }).withMessage("Purchase Order is reqiure"),
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
