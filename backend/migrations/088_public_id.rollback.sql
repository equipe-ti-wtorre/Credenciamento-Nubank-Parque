-- Rollback de 088_public_id.sql. Nao entra no manifest.

ALTER TABLE `event` DROP INDEX IF EXISTS `uk_event_public_id`;
ALTER TABLE `event` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_accreditation` DROP INDEX IF EXISTS `uk_event_accreditation_public_id`;
ALTER TABLE `event_accreditation` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `service_access` DROP INDEX IF EXISTS `uk_service_access_public_id`;
ALTER TABLE `service_access` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `setores` DROP INDEX IF EXISTS `uk_setores_public_id`;
ALTER TABLE `setores` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `aprovacoes` DROP INDEX IF EXISTS `uk_aprovacoes_public_id`;
ALTER TABLE `aprovacoes` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `company` DROP INDEX IF EXISTS `uk_company_public_id`;
ALTER TABLE `company` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `collaborator` DROP INDEX IF EXISTS `uk_collaborator_public_id`;
ALTER TABLE `collaborator` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `usuarios` DROP INDEX IF EXISTS `uk_usuarios_public_id`;
ALTER TABLE `usuarios` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `perfis` DROP INDEX IF EXISTS `uk_perfis_public_id`;
ALTER TABLE `perfis` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `azure_tenants` DROP INDEX IF EXISTS `uk_azure_tenants_public_id`;
ALTER TABLE `azure_tenants` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `vehicle` DROP INDEX IF EXISTS `uk_vehicle_public_id`;
ALTER TABLE `vehicle` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `teams_integrations` DROP INDEX IF EXISTS `uk_teams_integrations_public_id`;
ALTER TABLE `teams_integrations` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `alertas` DROP INDEX IF EXISTS `uk_alertas_public_id`;
ALTER TABLE `alertas` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `product` DROP INDEX IF EXISTS `uk_product_public_id`;
ALTER TABLE `product` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `storage_location` DROP INDEX IF EXISTS `uk_storage_location_public_id`;
ALTER TABLE `storage_location` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `external_company` DROP INDEX IF EXISTS `uk_external_company_public_id`;
ALTER TABLE `external_company` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `bracelet_type` DROP INDEX IF EXISTS `uk_bracelet_type_public_id`;
ALTER TABLE `bracelet_type` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `collaborator_role` DROP INDEX IF EXISTS `uk_collaborator_role_public_id`;
ALTER TABLE `collaborator_role` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `collaborator_block_list` DROP INDEX IF EXISTS `uk_collaborator_block_list_public_id`;
ALTER TABLE `collaborator_block_list` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_day` DROP INDEX IF EXISTS `uk_event_day_public_id`;
ALTER TABLE `event_day` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_day_company` DROP INDEX IF EXISTS `uk_event_day_company_public_id`;
ALTER TABLE `event_day_company` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_day_company_vehicle` DROP INDEX IF EXISTS `uk_event_day_company_vehicle_public_id`;
ALTER TABLE `event_day_company_vehicle` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_day_company_collaborator` DROP INDEX IF EXISTS `uk_event_day_company_collaborator_public_id`;
ALTER TABLE `event_day_company_collaborator` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `setor_contatos` DROP INDEX IF EXISTS `uk_setor_contatos_public_id`;
ALTER TABLE `setor_contatos` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `setor_usuarios` DROP INDEX IF EXISTS `uk_setor_usuarios_public_id`;
ALTER TABLE `setor_usuarios` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_accreditation_company` DROP INDEX IF EXISTS `uk_event_accreditation_company_public_id`;
ALTER TABLE `event_accreditation_company` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_accreditation_collaborator` DROP INDEX IF EXISTS `uk_event_accreditation_collaborator_public_id`;
ALTER TABLE `event_accreditation_collaborator` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_accreditation_invite_file` DROP INDEX IF EXISTS `uk_event_accreditation_invite_file_public_id`;
ALTER TABLE `event_accreditation_invite_file` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_accreditation_day` DROP INDEX IF EXISTS `uk_event_accreditation_day_public_id`;
ALTER TABLE `event_accreditation_day` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_accreditation_setor` DROP INDEX IF EXISTS `uk_event_accreditation_setor_public_id`;
ALTER TABLE `event_accreditation_setor` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `service_access_collaborator` DROP INDEX IF EXISTS `uk_service_access_collaborator_public_id`;
ALTER TABLE `service_access_collaborator` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `service_access_vehicle` DROP INDEX IF EXISTS `uk_service_access_vehicle_public_id`;
ALTER TABLE `service_access_vehicle` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `company_contact` DROP INDEX IF EXISTS `uk_company_contact_public_id`;
ALTER TABLE `company_contact` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `aprovacao_decisoes` DROP INDEX IF EXISTS `uk_aprovacao_decisoes_public_id`;
ALTER TABLE `aprovacao_decisoes` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `material_movement` DROP INDEX IF EXISTS `uk_material_movement_public_id`;
ALTER TABLE `material_movement` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `material_movement_item` DROP INDEX IF EXISTS `uk_material_movement_item_public_id`;
ALTER TABLE `material_movement_item` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `company_type` DROP INDEX IF EXISTS `uk_company_type_public_id`;
ALTER TABLE `company_type` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `collaborator_document_type` DROP INDEX IF EXISTS `uk_collaborator_document_type_public_id`;
ALTER TABLE `collaborator_document_type` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `event_day_type` DROP INDEX IF EXISTS `uk_event_day_type_public_id`;
ALTER TABLE `event_day_type` DROP COLUMN IF EXISTS public_id;

ALTER TABLE `access_status` DROP INDEX IF EXISTS `uk_access_status_public_id`;
ALTER TABLE `access_status` DROP COLUMN IF EXISTS public_id;
