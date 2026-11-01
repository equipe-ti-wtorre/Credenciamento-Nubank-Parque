-- public_id UUID nas tabelas expostas pela API.
-- Idempotente no MariaDB 10.11. PK e FKs numericas permanecem.
-- Registros antigos recebem UUID(). Inserts novos usam DEFAULT ou crypto.randomUUID() no Node.

ALTER TABLE `event` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event`;
UPDATE `event` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_public_id` ON `event` (public_id);

ALTER TABLE `event_accreditation` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_accreditation`;
UPDATE `event_accreditation` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_accreditation` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_accreditation_public_id` ON `event_accreditation` (public_id);

ALTER TABLE `service_access` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_service_access`;
UPDATE `service_access` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `service_access` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_service_access_public_id` ON `service_access` (public_id);

ALTER TABLE `setores` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `setores` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `setores` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_setores_public_id` ON `setores` (public_id);

ALTER TABLE `aprovacoes` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `aprovacoes` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `aprovacoes` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_aprovacoes_public_id` ON `aprovacoes` (public_id);

ALTER TABLE `company` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_company`;
UPDATE `company` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `company` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_company_public_id` ON `company` (public_id);

ALTER TABLE `collaborator` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_collaborator`;
UPDATE `collaborator` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `collaborator` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_collaborator_public_id` ON `collaborator` (public_id);

ALTER TABLE `usuarios` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `usuarios` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `usuarios` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_usuarios_public_id` ON `usuarios` (public_id);

ALTER TABLE `perfis` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `perfis` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `perfis` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_perfis_public_id` ON `perfis` (public_id);

ALTER TABLE `azure_tenants` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `azure_tenants` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `azure_tenants` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_azure_tenants_public_id` ON `azure_tenants` (public_id);

ALTER TABLE `vehicle` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_vehicle`;
UPDATE `vehicle` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `vehicle` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_vehicle_public_id` ON `vehicle` (public_id);

ALTER TABLE `teams_integrations` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `teams_integrations` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `teams_integrations` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_teams_integrations_public_id` ON `teams_integrations` (public_id);

ALTER TABLE `alertas` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `alertas` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `alertas` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_alertas_public_id` ON `alertas` (public_id);

ALTER TABLE `product` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_product`;
UPDATE `product` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `product` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_product_public_id` ON `product` (public_id);

ALTER TABLE `storage_location` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_storage_location`;
UPDATE `storage_location` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `storage_location` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_storage_location_public_id` ON `storage_location` (public_id);

ALTER TABLE `external_company` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_external_company`;
UPDATE `external_company` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `external_company` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_external_company_public_id` ON `external_company` (public_id);

ALTER TABLE `bracelet_type` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_bracelet_type`;
UPDATE `bracelet_type` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `bracelet_type` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_bracelet_type_public_id` ON `bracelet_type` (public_id);

ALTER TABLE `collaborator_role` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_collaborator_role`;
UPDATE `collaborator_role` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `collaborator_role` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_collaborator_role_public_id` ON `collaborator_role` (public_id);

ALTER TABLE `collaborator_block_list` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_collaborator`;
UPDATE `collaborator_block_list` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `collaborator_block_list` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_collaborator_block_list_public_id` ON `collaborator_block_list` (public_id);

ALTER TABLE `event_day` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_day`;
UPDATE `event_day` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_day` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_day_public_id` ON `event_day` (public_id);

ALTER TABLE `event_day_company` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_day_company`;
UPDATE `event_day_company` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_day_company` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_day_company_public_id` ON `event_day_company` (public_id);

ALTER TABLE `event_day_company_vehicle` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_day_company_vehicle`;
UPDATE `event_day_company_vehicle` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_day_company_vehicle` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_day_company_vehicle_public_id` ON `event_day_company_vehicle` (public_id);

ALTER TABLE `event_day_company_collaborator` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_day_company_collaborator`;
UPDATE `event_day_company_collaborator` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_day_company_collaborator` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_day_company_collaborator_public_id` ON `event_day_company_collaborator` (public_id);

ALTER TABLE `setor_contatos` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `setor_contatos` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `setor_contatos` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_setor_contatos_public_id` ON `setor_contatos` (public_id);

ALTER TABLE `setor_usuarios` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `setor_usuarios` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `setor_usuarios` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_setor_usuarios_public_id` ON `setor_usuarios` (public_id);

ALTER TABLE `event_accreditation_company` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_accreditation_company`;
UPDATE `event_accreditation_company` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_accreditation_company` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_accreditation_company_public_id` ON `event_accreditation_company` (public_id);

ALTER TABLE `event_accreditation_collaborator` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_accreditation_collaborator`;
UPDATE `event_accreditation_collaborator` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_accreditation_collaborator` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_accreditation_collaborator_public_id` ON `event_accreditation_collaborator` (public_id);

ALTER TABLE `event_accreditation_invite_file` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_accreditation_invite_file`;
UPDATE `event_accreditation_invite_file` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_accreditation_invite_file` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_accreditation_invite_file_public_id` ON `event_accreditation_invite_file` (public_id);

ALTER TABLE `event_accreditation_day` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_accreditation_day`;
UPDATE `event_accreditation_day` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_accreditation_day` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_accreditation_day_public_id` ON `event_accreditation_day` (public_id);

ALTER TABLE `event_accreditation_setor` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_setor`;
UPDATE `event_accreditation_setor` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_accreditation_setor` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_accreditation_setor_public_id` ON `event_accreditation_setor` (public_id);

ALTER TABLE `service_access_collaborator` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_service_access_collaborator`;
UPDATE `service_access_collaborator` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `service_access_collaborator` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_service_access_collaborator_public_id` ON `service_access_collaborator` (public_id);

ALTER TABLE `service_access_vehicle` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_service_access_vehicle`;
UPDATE `service_access_vehicle` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `service_access_vehicle` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_service_access_vehicle_public_id` ON `service_access_vehicle` (public_id);

ALTER TABLE `company_contact` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_company_contact`;
UPDATE `company_contact` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `company_contact` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_company_contact_public_id` ON `company_contact` (public_id);

ALTER TABLE `aprovacao_decisoes` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id`;
UPDATE `aprovacao_decisoes` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `aprovacao_decisoes` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_aprovacao_decisoes_public_id` ON `aprovacao_decisoes` (public_id);

ALTER TABLE `material_movement` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_material_movement`;
UPDATE `material_movement` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `material_movement` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_material_movement_public_id` ON `material_movement` (public_id);

ALTER TABLE `material_movement_item` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_material_movement_item`;
UPDATE `material_movement_item` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `material_movement_item` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_material_movement_item_public_id` ON `material_movement_item` (public_id);

ALTER TABLE `company_type` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_company_type`;
UPDATE `company_type` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `company_type` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_company_type_public_id` ON `company_type` (public_id);

ALTER TABLE `collaborator_document_type` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_collaborator_document_type`;
UPDATE `collaborator_document_type` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `collaborator_document_type` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_collaborator_document_type_public_id` ON `collaborator_document_type` (public_id);

ALTER TABLE `event_day_type` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_event_day_type`;
UPDATE `event_day_type` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `event_day_type` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_event_day_type_public_id` ON `event_day_type` (public_id);

ALTER TABLE `access_status` ADD COLUMN IF NOT EXISTS public_id UUID NULL AFTER `id_access_status`;
UPDATE `access_status` SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE `access_status` MODIFY public_id UUID NOT NULL DEFAULT (UUID());
CREATE UNIQUE INDEX IF NOT EXISTS `uk_access_status_public_id` ON `access_status` (public_id);
