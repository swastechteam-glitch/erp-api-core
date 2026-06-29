// ---------------------------------------------------------------------------
// Yarn Cone Packing (frmYarnConeProductionAdd) — count-driven weigh-and-save.
//
// Functionally identical to On Line Packing (frmYarnProductionEntry_OnLine):
// pick a Count (fixing entry), capture the Weight, and save a bag into
// tbl_YarnStock via sp_YarnStock_AddEdit. The React screen (YarnConePackingList)
// is an exact mirror of the online-packing screen and calls the same endpoint
// shape under /yarn-cone-packing — so we reuse the same handlers here rather
// than duplicate the logic. If Cone Packing ever needs to diverge (e.g. a
// different EntryType or stored proc), replace these re-exports with dedicated
// implementations.
// ---------------------------------------------------------------------------

export {
  getCounts,
  getNextBagNo,
  getList,
  create,
  update,
  remove,
} from "./yarnOnlinePacking.controller.js";
