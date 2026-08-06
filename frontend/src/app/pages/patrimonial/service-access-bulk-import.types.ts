export type CadastroStatus = 'novo' | 'atualizacao' | 'inalterado' | 'erro';
export type VinculoStatus = 'a_vincular' | 'ja_vinculado';

export interface UnifiedDivergence {
  campo: string;
  rotulo: string;
  atual: unknown;
  novo: unknown;
}

export interface UnifiedMotorista {
  documento: string;
  nome: string | null;
  encontrado: boolean;
  origem?: 'planilha' | 'acesso';
}

export interface UnifiedCollaboratorRow {
  linha: number;
  cadastro: CadastroStatus;
  vinculo: VinculoStatus;
  chave: { documento: string; tipo: string | null };
  resolvido?: Record<string, number> | null;
  divergencias: UnifiedDivergence[];
  divergencias_vinculo?: UnifiedDivergence[];
  erros: string[];
  nome?: string | null;
  /** Só falta Função / Cargo — pode corrigir na revisão. */
  pendente_funcao?: boolean;
}

export interface UnifiedVehicleDados {
  marca?: string | null;
  modelo?: string | null;
  cor?: string | null;
  tipo?: string | null;
  observacoes?: string | null;
  empresa?: string | null;
}

export interface UnifiedVehicleRow {
  linha: number;
  cadastro: CadastroStatus;
  vinculo: VinculoStatus;
  chave: { placa: string | null };
  /** Marca, modelo, cor, tipo (e empresa na frota) para a revisão. */
  dados?: UnifiedVehicleDados | null;
  motorista: UnifiedMotorista | null;
  divergencias: UnifiedDivergence[];
  erros: string[];
}

export interface UnifiedAxisSummary {
  total: number;
  novos: number;
  atualizacoes: number;
  inalterados: number;
  erros: number;
  a_vincular: number;
  ja_vinculados: number;
}

export interface UnifiedBulkPreviewResult {
  arquivo: string;
  previewToken: string;
  acesso: { id: number; nome: string; empresa: string | null };
  resumo: {
    colaboradores: UnifiedAxisSummary;
    veiculos: UnifiedAxisSummary;
  };
  colaboradores: UnifiedCollaboratorRow[];
  veiculos: UnifiedVehicleRow[];
  updateFields?: {
    colaboradorMaster: string[];
    colaboradorVinculo: string[];
    veiculo: string[];
  };
}

export interface UnifiedColaboradorDecision {
  linha: number;
  aplicar: boolean;
  camposMaster?: string[];
  aplicarFuncao?: boolean;
  /** Correção de função em linhas pendente_funcao. */
  id_collaborator_role?: number;
}

export interface UnifiedVeiculoDecision {
  linha: number;
  aplicar: boolean;
  campos?: string[];
}

export interface UnifiedBulkConfirmBody {
  previewToken: string;
  decisoes: {
    colaboradores: UnifiedColaboradorDecision[];
    veiculos: UnifiedVeiculoDecision[];
  };
}

export interface UnifiedBulkConfirmResult {
  colaboradores: {
    inseridos: number;
    atualizados: number;
    vinculados: number;
    ignorados: number;
    erros: { linha: number; motivo: string }[];
  };
  veiculos: {
    inseridos: number;
    atualizados: number;
    vinculados: number;
    ignorados: number;
    erros: { linha: number; motivo: string }[];
  };
  motoristas: number;
  importedAt?: string;
}
