const Joi = require("joi");

const serviceAccessCreateSchema = Joi.object({
  id_company: Joi.number().integer().positive().optional(),
  id_setor: Joi.number().integer().positive().required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).required(),
  finalidade: Joi.string().trim().max(500).required().messages({
    "string.empty": "Informe o nome do evento.",
    "any.required": "Informe o nome do evento.",
  }),
  requesting_department: Joi.string().trim().max(200).required(),
  observacao: Joi.string().trim().max(500).required().messages({
    "string.empty": "Informe a descrição do serviço.",
    "any.required": "Informe a descrição do serviço.",
  }),
  notificar_entrada: Joi.boolean().optional(),
  notificar_entrada_colaborador: Joi.boolean().optional(),
  notificar_entrada_veiculo: Joi.boolean().optional(),
  notify_approvers: Joi.boolean().default(true),
});

const serviceAccessUpdateSchema = Joi.object({
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  finalidade: Joi.string().trim().max(500).optional(),
  requesting_department: Joi.string().trim().max(200).optional(),
  observacao: Joi.string().trim().max(500).allow("", null).optional(),
  id_setor: Joi.number().integer().positive().optional(),
  notificar_entrada: Joi.boolean().optional(),
  notificar_entrada_colaborador: Joi.boolean().optional(),
  notificar_entrada_veiculo: Joi.boolean().optional(),
})
  .min(1)
  .custom((value, helpers) => {
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
      return helpers.error("any.invalid");
    }
    return value;
  }, "date range validation");

const serviceAccessStatusSchema = Joi.object({
  id_access_status: Joi.number().integer().valid(2, 3, 4).required(),
  reason: Joi.when("id_access_status", {
    is: 4,
    then: Joi.string().min(5).max(500).required(),
    otherwise: Joi.string().max(500).allow("", null).optional(),
  }),
});

const serviceAccessEnabledSchema = Joi.object({
  status: Joi.boolean().required(),
});

const serviceAccessCollaboratorSchema = Joi.object({
  id_collaborator: Joi.number().integer().positive().required(),
  id_collaborator_role: Joi.number().integer().positive().required(),
});

const serviceAccessVehicleSchema = Joi.object({
  id_vehicle: Joi.number().integer().positive().required(),
});

const serviceAccessPeriodSchema = Joi.object({
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).required(),
});

const serviceAccessRelationsSchema = Joi.object({
  collaborators: Joi.array()
    .items(
      Joi.object({
        id_collaborator: Joi.number().integer().positive().required(),
        id_collaborator_role: Joi.number().integer().positive().required(),
      }),
    )
    .required(),
  vehicles: Joi.array()
    .items(
      Joi.object({
        id_vehicle: Joi.number().integer().positive().required(),
      }),
    )
    .required(),
  notify_approvers: Joi.boolean().optional(),
  id_setor: Joi.number().integer().positive().optional(),
});

const serviceAccessValidateOverlapSchema = Joi.object({
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).required(),
  id_collaborators: Joi.array().items(Joi.number().integer().positive()).default([]),
  exclude_service_access_id: Joi.number().integer().positive().allow(null).optional(),
});

module.exports = {
  serviceAccessCreateSchema,
  serviceAccessUpdateSchema,
  serviceAccessPeriodSchema,
  serviceAccessStatusSchema,
  serviceAccessEnabledSchema,
  serviceAccessCollaboratorSchema,
  serviceAccessVehicleSchema,
  serviceAccessRelationsSchema,
  serviceAccessValidateOverlapSchema,
};
