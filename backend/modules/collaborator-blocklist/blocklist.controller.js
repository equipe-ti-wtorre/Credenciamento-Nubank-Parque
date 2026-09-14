const AppError = require("../../utils/AppError");
const { attachAudit } = require("../../utils/auditLogger");
const blocklistService = require("./blocklist.service");
const { blockCreateSchema, blockUpdateSchema } = require("./blocklist.schema");

exports.list = async (req, res, next) => {
  try {
    const { page, limit, offset } = blocklistService.parseListQuery(req.query);
    const result = await blocklistService.listBlocks({
      page,
      limit,
      offset,
      q: req.query.q,
      block_type: req.query.block_type,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.searchCollaborators = async (req, res, next) => {
  try {
    const result = await blocklistService.searchCollaborators({
      q: req.query.q,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await blocklistService.getBlock(req.params.id);
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { error, value } = blockCreateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const item = await blocklistService.addBlock(value, req.user?.id);

    attachAudit(req, {
      action: "CREATE",
      module: "collaborator_blocklist",
      event: "collaborator.blocklist.add",
      resource: {
        type: "collaborator",
        id: item.id_collaborator,
        name: item.name,
      },
      changes: {
        reason: value.reason,
        block_type: value.block_type,
        block_value: value.block_value ?? null,
      },
      metadata: { alertLevel: "critical", reason: value.reason },
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { error, value } = blockUpdateSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const item = await blocklistService.updateBlock(req.params.id, value);

    attachAudit(req, {
      action: "UPDATE",
      module: "collaborator_blocklist",
      event: "collaborator.blocklist.update",
      resource: {
        type: "collaborator",
        id: item.id_collaborator,
        name: item.name,
      },
      changes: value,
    });

    res.json({ item });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const result = await blocklistService.removeBlock(req.params.id);

    attachAudit(req, {
      action: "DELETE",
      module: "collaborator_blocklist",
      event: "collaborator.blocklist.remove",
      resource: {
        type: "collaborator",
        id: result.id_collaborator,
      },
      metadata: { alertLevel: "critical" },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};
