// import sql from "mssql";
// import { getPool } from "../config/dynamicDB.js";

// export const yarnInvoiceApproval = async (req, res) => {
//   const { invoiceConfDate, invoiceCode, reject, companyCode, message } =
//     req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;
//     const nodeCode = req.headers.nodeCode;
//     // Step 2: DB Transaction

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       if (!reject) {
//         await request
//           .input("InvoiceConfDate", sql.DateTime, new Date(invoiceConfDate))
//           .input("InvoiceCode", sql.Int, invoiceCode)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("InvoiceConfUser", sql.Int, userId)
//           .execute("sp_InvoiceConfirmation_Insert");
//       } else {
//         await request
//           // .input("InvoiceConfDate", sql.DateTime, new Date(invoiceConfDate))
//           .input("InvoiceCode", sql.Int, invoiceCode)
//           .input("CancelUserCode", sql.Int, userId)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("CancelNodeCode", sql.Int, nodeCode)
//           .execute("sp_InvoiceCancel_Insert");
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, invoiceCode)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "YARN")
//         .input("subModuleName", sql.NVarChar, "Yarn Invoice Approval")
//         .execute("web_sp_Notification_Update");

//       await request.batch(`
//         EXEC sp_Pending_InvoiceList @CompanyCOde = ${companyCode};
//         UPDATE tbl_DashBoard
//         SET Yarn_Invoice_Approval_Pendings = @@ROWCOUNT
//       `);

//       await transaction.commit();
//       return res.status(201).json({ success: true, message: message });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Please Check the Entry" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const yarnSalesOrderApproval = async (req, res) => {
//   const { id, companyCode, remarks, message } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);

//       await request
//         .input("SOCode", sql.Int, id)
//         .input("CompanyCode", sql.Int, companyCode)
//         .input("ApprovalUserCode", sql.Int, userId)
//         .execute("sp_SalesOrder_Approval");

//          // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "YARN")
//         .input("subModuleName", sql.NVarChar, "Yarn Sales Order Approval")
//         .execute("web_sp_Notification_Update");

//            await request.batch(`
//         EXEC sp_Pending_SalesOrderApproval @CompanyCOde = ${companyCode};
//         UPDATE tbl_DashBoard
//         SET Yarn_SalesOrderApproval_Pendings = @@ROWCOUNT
//       `);

//       await transaction.commit();
//       return res.status(201).json({ success: true, message: message });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Please Check the Entry" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const yarnSalesReturnApproval = async (req, res) => {
//   const { approvalDate, id, reject, remarks, companyCode, message } = req.body;

//   try {
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);
//     const userId = req.headers.userId;
//     const FYCode = req.headers.FYCode;
//     const nodeCode = req.headers.nodeCode;
//     // Step 2: DB Transaction

//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     try {
//       const request = new sql.Request(transaction);
//       if (reject == 0) {
//         await request
//           .input("ApprovalDate", sql.DateTime, new Date(approvalDate))
//           .input("SalesReturnCode", sql.Int, id)
//           .input("Remarks", sql.NVarChar(500), remarks || "")
//           .input("Reject", sql.Bit, reject)
//           .input("FYCode", sql.Int, FYCode)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_SalesReturnApproval_Insert");
//       } else {
//         await request
//           // .input("InvoiceConfDate", sql.DateTime, new Date(invoiceConfDate))
//           .input("ApprovalDate", sql.DateTime, new Date(approvalDate))
//           .input("SalesReturnCode", sql.Int, id)
//           .input("Remarks", sql.NVarChar(500), remarks || "")
//           .input("Reject", sql.Bit, reject)
//           .input("FYCode", sql.Int, FYCode)
//           .input("CompanyCode", sql.Int, companyCode)
//           .input("User", sql.Int, userId)
//           .input("Node", sql.Int, nodeCode)
//           .execute("sp_SalesReturnApproval_Insert");
//       }

//       // Notification Update
//       const request3 = new sql.Request(transaction);
//       await request3
//         .input("ApprovalID", sql.Int, id)
//         .input("IsNotify", sql.Bit, 1)
//         .input("IsRead", sql.Bit, 1)
//         .input("IsApproved", sql.Bit, 1)
//         .input("ModuleName", sql.NVarChar, "YARN")
//         .input("subModuleName", sql.NVarChar, "Yarn Sales Return Approval")
//         .execute("web_sp_Notification_Update");

//       await request.batch(`
//         EXEC sp_SalesReturnApproval @CompanyCOde = ${companyCode};
//         UPDATE tbl_DashBoard
//         SET Yarn_SalesReturn_Approval = @@ROWCOUNT
//       `);

//       await transaction.commit();
//       return res.status(201).json({ success: true, message: message });
//     } catch (err) {
//       await transaction.rollback();

//       if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Please Check the Entry" });
//       }

//       return res.status(500).json({ success: false, error: err.message });
//     }
//   } catch (err) {
//     return res.status(500).json({ success: false, error: err.message });
//   }
// };

// export const getSalesOrderOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("SOCode", sql.Int, parseInt(paramId?.id))
//       .input("Web", 1)
//       .execute("web_sp_SalesOrderDetails_GetAll");

//     // let detailedResult = await pool
//     //   .request()
//     //   .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//     //   .input("SOCode", sql.Int, parseInt(paramId?.id))
//     //   .input("Web", 1)
//     //   .execute("web_sp_SalesOrderDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.SOCode,
//     });
//     // Apply pagination manually
//     const paginatedData = mainResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );
//     const outputData = {
//       mainOutput: addId,
//       detailedOutput: paginatedData,
//     };
//     res.status(200).json({
//       totalRecords: mainResult?.recordset.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(mainResult?.recordset.length / pageSize),
//       data: outputData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err });
//   }
// };

// export const getInvoiceOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("InvoiceCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_Invoice_GetByInvoiceCode");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("InvoiceCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_Invoice_GetByInvoiceCode_Multi");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       OtherChargesAmount: mainResult?.recordsets?.[0]?.[0]?.OtherChargesAmount,
//       id: mainResult?.recordsets?.[0]?.[0]?.InvoiceCode,
//     });
//     // Apply pagination manually
//     const paginatedData = detailedResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );
//     const outputData = {
//       mainOutput: addId,
//       detailedOutput: paginatedData,
//     };
//     res.status(200).json({
//       totalRecords: detailedResult?.recordset.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
//       data: outputData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// export const getSalesReturnOverview = async (req, res) => {
//   try {
//     const paramData = req.query;
//     const paramId = req.params;

//     // Extract pagination params with defaults
//     const page = parseInt(paramData?.page) || 1;
//     const pageSize = parseInt(paramData?.pageSize) || 5;
//     const offset = (page - 1) * pageSize;

//     // Connect to the database
//     if (!req.headers.subdbname)
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing subDBName" });

//     const pool = await getPool(req.headers.subdbname);

//     // Execute the stored procedure
//     let mainResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("SalesReturnCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_SalesReturn_GetAll");

//     let detailedResult = await pool
//       .request()
//       .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
//       .input("SalesReturnCode", sql.Int, parseInt(paramId?.id))
//       .execute("web_sp_SalesReturnDetails_GetAll");

//     const addId = Object.assign({
//       ...mainResult?.recordsets?.[0]?.[0],
//       id: mainResult?.recordsets?.[0]?.[0]?.SalesReturnCode,
//     });
//     // Apply pagination manually
//     const paginatedData = detailedResult?.recordset?.slice(
//       offset,
//       offset + pageSize
//     );
//     const outputData = {
//       mainOutput: addId,
//       detailedOutput: paginatedData,
//     };
//     res.status(200).json({
//       totalRecords: detailedResult?.recordset.length,
//       currentPage: page,
//       pageSize: pageSize,
//       totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
//       data: outputData,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

import sql from "mssql";
import { getPool } from "../config/dynamicDB.js";
import { applyBranchCode } from "../utils/common.js";

// ✅ Helper to safely extract and apply BranchCode
// const applyBranchCode = (request, headers) => {
//   const bCode = headers["branchCode"] || headers["branchcode"];
//   const companyCode = headers["companyCode"] || headers["companyCode"];
//   console.log(companyCode, "companyCode 98799");

//   if (bCode) {
//     request.input("BranchCode", sql.Int, parseInt(bCode));
//   }
//   if (companyCode) {
//     request.input("CompanyCode", sql.Int, parseInt(companyCode));
//   }
// };

export const yarnInvoiceApproval = async (req, res) => {
  const { invoiceConfDate, invoiceCode, reject, companyCode, message } =
    req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, nodeCode } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      if (!reject) {
        await request
          .input("InvoiceConfDate", sql.DateTime, new Date(invoiceConfDate))
          .input("InvoiceCode", sql.Int, invoiceCode)
          // .input("CompanyCode", sql.Int, companyCode)
          .input("InvoiceConfUser", sql.Int, userId)
          .execute("sp_InvoiceConfirmation_Insert");
      } else {
        await request
          .input("InvoiceCode", sql.Int, invoiceCode)
          .input("CancelUserCode", sql.Int, userId)
          // .input("CompanyCode", sql.Int, companyCode)
          .input("CancelNodeCode", sql.Int, nodeCode)
          .execute("sp_InvoiceCancel_Insert");
      }

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, invoiceCode)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "YARN")
        .input("subModuleName", sql.NVarChar, "Yarn Invoice Approval")
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const batchReq = new sql.Request(transaction);
      applyBranchCode(batchReq, req.headers); // 👈 Fix applied
      await batchReq.batch(`
        EXEC sp_Pending_InvoiceList @CompanyCOde = ${companyCode};
        UPDATE tbl_DashBoard
        SET Yarn_Invoice_Approval_Pendings = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(201).json({ success: true, message: message });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
        return res
          .status(400)
          .json({ success: false, message: "Please Check the Entry" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const yarnSalesOrderApproval = async (req, res) => {
  const { id, companyCode, remarks, message } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const userId = req.headers.userId;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      await request
        .input("SOCode", sql.Int, id)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("ApprovalUserCode", sql.Int, userId)
        .execute("sp_SalesOrder_Approval");

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "YARN")
        .input("subModuleName", sql.NVarChar, "Yarn Sales Order Approval")
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const batchReq = new sql.Request(transaction);
      applyBranchCode(batchReq, req.headers); // 👈 Fix applied
      await batchReq.batch(`
        EXEC sp_Pending_SalesOrderApproval @CompanyCOde = ${companyCode};
        UPDATE tbl_DashBoard
        SET Yarn_SalesOrderApproval_Pendings = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(201).json({ success: true, message: message });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
        return res
          .status(400)
          .json({ success: false, message: "Please Check the Entry" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const yarnSalesReturnApproval = async (req, res) => {
  const { approvalDate, id, reject, remarks, companyCode, message } = req.body;

  try {
    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    const { userId, FYCode, nodeCode } = req.headers;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      applyBranchCode(request, req.headers); // 👈 Fix applied

      // Common inputs
      request
        .input("ApprovalDate", sql.DateTime, new Date(approvalDate))
        .input("SalesReturnCode", sql.Int, id)
        .input("Remarks", sql.NVarChar(500), remarks || "")
        .input("Reject", sql.Bit, reject)
        .input("FYCode", sql.Int, FYCode)
        // .input("CompanyCode", sql.Int, companyCode)
        .input("User", sql.Int, userId)
        .input("Node", sql.Int, nodeCode);

      // Execute same SP for approve or reject based on input bit
      await request.execute("sp_SalesReturnApproval_Insert");

      // Notification Update
      const request3 = new sql.Request(transaction);
      applyBranchCode(request3, req.headers); // 👈 Fix applied
      if (request3.parameters && request3.parameters.CompanyCode) {
        delete request3.parameters.CompanyCode;
      }
      await request3
        .input("ApprovalID", sql.Int, id)
        .input("IsNotify", sql.Bit, 1)
        .input("IsRead", sql.Bit, 1)
        .input("IsApproved", sql.Bit, 1)
        .input("ModuleName", sql.NVarChar, "YARN")
        .input("subModuleName", sql.NVarChar, "Yarn Sales Return Approval")
        .execute("web_sp_Notification_Update");

      // Dashboard Update
      const batchReq = new sql.Request(transaction);
      applyBranchCode(batchReq, req.headers); // 👈 Fix applied
      await batchReq.batch(`
        EXEC sp_SalesReturnApproval @CompanyCOde = ${companyCode};
        UPDATE tbl_DashBoard
        SET Yarn_SalesReturn_Approval = @@ROWCOUNT
      `);

      await transaction.commit();
      return res.status(201).json({ success: true, message: message });
    } catch (err) {
      await transaction.rollback();
      if (err.message.includes("UK_tbl_Purchase_PurchaseName")) {
        return res
          .status(400)
          .json({ success: false, message: "Please Check the Entry" });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getSalesOrderOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);
    // Execute the stored procedure
    let mainResult = await pool
      .request()
      // .input("CompanyCode", sql.Int, Number(paramData?.companyCode))
      .input("SOCode", sql.Int, Number(paramId?.id))
      .input("Web", 1);

    // Fix: Add BranchCode
    applyBranchCode(mainResult, req.headers);

    const data = await mainResult.execute("web_sp_SalesOrderDetails_GetAll");

    const addId = Object.assign({
      ...data?.recordsets?.[0]?.[0],
      id: data?.recordsets?.[0]?.[0]?.SOCode,
    });

    const paginatedData = data?.recordset?.slice(offset, offset + pageSize);
    const outputData = {
      mainOutput: addId,
      detailedOutput: paginatedData,
    };

    res.status(200).json({
      totalRecords: data?.recordset?.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data?.recordset?.length / pageSize),
      data: outputData,
    });
  } catch (err) {
    console.log(err, "34567");
    res.status(500).json({ error: err });
  }
};

export const getInvoiceOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Main Result
    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("InvoiceCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_Invoice_GetByInvoiceCode");

    // Detailed Result
    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("InvoiceCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_Invoice_GetByInvoiceCode_Multi");

    const addId = Object.assign({
      ...mainResult?.recordsets?.[0]?.[0],
      OtherChargesAmount: mainResult?.recordsets?.[0]?.[0]?.OtherChargesAmount,
      id: mainResult?.recordsets?.[0]?.[0]?.InvoiceCode,
    });

    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + pageSize,
    );
    const outputData = {
      mainOutput: addId,
      detailedOutput: paginatedData,
    };

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: outputData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSalesReturnOverview = async (req, res) => {
  try {
    const paramData = req.query;
    const paramId = req.params;
    const page = parseInt(paramData?.page) || 1;
    const pageSize = parseInt(paramData?.pageSize) || 5;
    const offset = (page - 1) * pageSize;

    if (!req.headers.subdbname)
      return res
        .status(400)
        .json({ success: false, message: "Missing subDBName" });

    const pool = await getPool(req.headers.subdbname);

    // Main Result
    const req1 = pool.request();
    applyBranchCode(req1, req.headers); // 👈 Fix applied
    let mainResult = await req1
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("SalesReturnCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_SalesReturn_GetAll");

    // Detailed Result
    const req2 = pool.request();
    applyBranchCode(req2, req.headers); // 👈 Fix applied
    let detailedResult = await req2
      // .input("CompanyCode", sql.Int, parseInt(paramData?.companyCode))
      .input("SalesReturnCode", sql.Int, parseInt(paramId?.id))
      .execute("web_sp_SalesReturnDetails_GetAll");

    const addId = Object.assign({
      ...mainResult?.recordsets?.[0]?.[0],
      id: mainResult?.recordsets?.[0]?.[0]?.SalesReturnCode,
    });

    const paginatedData = detailedResult?.recordset?.slice(
      offset,
      offset + pageSize,
    );
    const outputData = {
      mainOutput: addId,
      detailedOutput: paginatedData,
    };

    res.status(200).json({
      totalRecords: detailedResult?.recordset.length,
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(detailedResult?.recordset.length / pageSize),
      data: outputData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
