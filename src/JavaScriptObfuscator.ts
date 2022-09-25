import { inject, injectable, } from 'inversify';
import { ServiceIdentifiers } from './container/ServiceIdentifiers';

import * as acorn from 'acorn';
import * as escodegen from '@javascript-obfuscator/escodegen';
import * as ESTree from 'estree';

import { TObfuscationResultFactory } from './types/container/source-code/TObfuscationResultFactory';

import { ICodeTransformersRunner } from './interfaces/code-transformers/ICodeTransformersRunner';
import { IGeneratorOutput } from './interfaces/IGeneratorOutput';
import { IJavaScriptObfuscator } from './interfaces/IJavaScriptObfsucator';
import { ILogger } from './interfaces/logger/ILogger';
import { IObfuscationResult } from './interfaces/source-code/IObfuscationResult';
import { IOptions } from './interfaces/options/IOptions';
import { IRandomGenerator } from './interfaces/utils/IRandomGenerator';
import { INodeTransformersRunner } from './interfaces/node-transformers/INodeTransformersRunner';

import { CodeTransformer } from './enums/code-transformers/CodeTransformer';
import { CodeTransformationStage } from './enums/code-transformers/CodeTransformationStage';
import { LoggingMessage } from './enums/logger/LoggingMessage';
import { NodeTransformer } from './enums/node-transformers/NodeTransformer';
import { NodeTransformationStage } from './enums/node-transformers/NodeTransformationStage';
import { SourceMapSourcesMode } from './enums/source-map/SourceMapSourcesMode';

import { ecmaVersion } from './constants/EcmaVersion';

import { ASTParserFacade } from './ASTParserFacade';
import { NodeGuards } from './node/NodeGuards';
import { Utils } from './utils/Utils';

@injectable()
export class JavaScriptObfuscator implements IJavaScriptObfuscator {
    /**
     * @type {Options}
     */
    private static readonly parseOptions: acorn.Options = {
        ecmaVersion,
        allowHashBang: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        locations: true,
        ranges: true
    };

    /**
     * @type {GenerateOptions}
     */
    private static readonly escodegenParams: escodegen.GenerateOptions = {
        comment: true,
        verbatim: 'x-verbatim-property',
        sourceMapWithCode: true
    };

    /**
     * @type {CodeTransformer[]}
     */
    private static readonly codeTransformersList: CodeTransformer[] = [
        CodeTransformer.HashbangOperatorTransformer
    ];

    /**
     * @type {NodeTransformer[]}
     */
    private static readonly nodeTransformersList: NodeTransformer[] = [
        NodeTransformer.BooleanLiteralTransformer,
        NodeTransformer.BlockStatementControlFlowTransformer,
        NodeTransformer.BlockStatementSimplifyTransformer,
        NodeTransformer.ClassFieldTransformer,
        NodeTransformer.CommentsTransformer,
        NodeTransformer.CustomCodeHelpersTransformer,
        NodeTransformer.DeadCodeInjectionTransformer,
        NodeTransformer.EscapeSequenceTransformer,
        NodeTransformer.EvalCallExpressionTransformer,
        NodeTransformer.ExportSpecifierTransformer,
        NodeTransformer.ExpressionStatementsMergeTransformer,
        NodeTransformer.FunctionControlFlowTransformer,
        NodeTransformer.IfStatementSimplifyTransformer,
        NodeTransformer.LabeledStatementTransformer,
        NodeTransformer.RenamePropertiesTransformer,
        NodeTransformer.MemberExpressionTransformer,
        NodeTransformer.MetadataTransformer,
        NodeTransformer.NumberLiteralTransformer,
        NodeTransformer.NumberToNumericalExpressionTransformer,
        NodeTransformer.ObfuscatingGuardsTransformer,
        NodeTransformer.ObjectExpressionKeysTransformer,
        NodeTransformer.ObjectExpressionTransformer,
        NodeTransformer.ObjectPatternPropertiesTransformer,
        NodeTransformer.ParentificationTransformer,
        NodeTransformer.ScopeIdentifiersTransformer,
        NodeTransformer.ScopeThroughIdentifiersTransformer,
        NodeTransformer.SplitStringTransformer,
        NodeTransformer.StringArrayControlFlowTransformer,
        NodeTransformer.StringArrayRotateFunctionTransformer,
        NodeTransformer.StringArrayScopeCallsWrapperTransformer,
        NodeTransformer.StringArrayTransformer,
        NodeTransformer.TemplateLiteralTransformer,
        NodeTransformer.DirectivePlacementTransformer,
        NodeTransformer.VariableDeclarationsMergeTransformer,
        NodeTransformer.VariablePreserveTransformer
    ];

    /**
     * @type {ICodeTransformersRunner}
     */
    private readonly codeTransformersRunner: ICodeTransformersRunner;

    /**
     * @type {ILogger}
     */
    private readonly logger: ILogger;

    /**
     * @type {TObfuscationResultFactory}
     */
    private readonly obfuscationResultFactory: TObfuscationResultFactory;

    /**
     * @type {IOptions}
     */
    private readonly options: IOptions;

    /**
     * @type {IRandomGenerator}
     */
    private readonly randomGenerator: IRandomGenerator;

    /**
     * @type {INodeTransformersRunner}
     */
    private readonly nodeTransformersRunner: INodeTransformersRunner;

    /**
     * @param {ICodeTransformersRunner} codeTransformersRunner
     * @param {INodeTransformersRunner} nodeTransformersRunner
     * @param {IRandomGenerator} randomGenerator
     * @param {TObfuscationResultFactory} obfuscatedCodeFactory
     * @param {ILogger} logger
     * @param {IOptions} options
     */
    public constructor (
        @inject(ServiceIdentifiers.ICodeTransformersRunner) codeTransformersRunner: ICodeTransformersRunner,
        @inject(ServiceIdentifiers.INodeTransformersRunner) nodeTransformersRunner: INodeTransformersRunner,
        @inject(ServiceIdentifiers.IRandomGenerator) randomGenerator: IRandomGenerator,
        @inject(ServiceIdentifiers.Factory__IObfuscationResult) obfuscatedCodeFactory: TObfuscationResultFactory,
        @inject(ServiceIdentifiers.ILogger) logger: ILogger,
        @inject(ServiceIdentifiers.IOptions) options: IOptions
    ) {
        this.codeTransformersRunner = codeTransformersRunner;
        this.nodeTransformersRunner = nodeTransformersRunner;
        this.randomGenerator = randomGenerator;
        this.obfuscationResultFactory = obfuscatedCodeFactory;
        this.logger = logger;
        this.options = options;
    }

    /**
     * @param {string} sourceCode
     * @returns {IObfuscationResult}
     */
    public obfuscate (sourceCode: string): IObfuscationResult {
        if (typeof sourceCode !== 'string') {
            sourceCode = '';
        }

        const timeStart: number = Date.now();
        this.logger.info(LoggingMessage.Version, Utils.buildVersionMessage(process.env.VERSION, process.env.BUILD_TIMESTAMP));
        this.logger.info(LoggingMessage.ObfuscationStarted);
        this.logger.info(LoggingMessage.RandomGeneratorSeed, this.randomGenerator.getInputSeed());

        // preparing code transformations
        // ①准备阶段
        sourceCode = this.runCodeTransformationStage(sourceCode, CodeTransformationStage.PreparingTransformers);
        console.log('[===①准备阶段】===]：', sourceCode);
        // parse AST tree
        // ②转换成AST Tree
        const astTree: ESTree.Program = this.parseCode(sourceCode);
        // astTree.body[0].kind = 'const';
        // astTree.body[0].declarations[0].id.name = 'rename';

        console.log('[===②转换成AST Tree===]：', astTree);

        // obfuscate AST tree
        // ③操作AST Tree
        const obfuscatedAstTree: ESTree.Program = this.transformAstTree(astTree);
        console.log('[===③操作AST Tree===]：', obfuscatedAstTree);

        // generate code
        // ④生成code
        const generatorOutput: IGeneratorOutput = this.generateCode(sourceCode, obfuscatedAstTree);
        console.log('[===④生成code===]：', generatorOutput);

        // finalizing code transformations
        // ⑤完成code转换
        generatorOutput.code = this.runCodeTransformationStage(generatorOutput.code, CodeTransformationStage.FinalizingTransformers);
        console.log('[===⑤完成code转换===]：', generatorOutput);

        const obfuscationTime: number = (Date.now() - timeStart) / 1000;
        this.logger.success(LoggingMessage.ObfuscationCompleted, obfuscationTime);

        return this.getObfuscationResult(generatorOutput);
    }

    /**
     * @param {string} sourceCode
     * @returns {Program}
     */
    private parseCode (sourceCode: string): ESTree.Program {
        return ASTParserFacade.parse(sourceCode, JavaScriptObfuscator.parseOptions);
    }

    /**
     * @param {Program} astTree
     * @returns {Program}
     */
    private transformAstTree (astTree: ESTree.Program): ESTree.Program {
        // 初始化阶段
        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.Initializing);
        console.log('初始化阶段: ', astTree);

        const isEmptyAstTree: boolean = NodeGuards.isProgramNode(astTree)
            && !astTree.body.length
            && !astTree.leadingComments
            && !astTree.trailingComments;

        if (isEmptyAstTree) {
            this.logger.warn(LoggingMessage.EmptySourceCode);

            return astTree;
        }
        // 准备阶段
        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.Preparing);
        console.log('准备阶段: ', astTree);

        // 死代码注入
        if (this.options.deadCodeInjection) {
            astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.DeadCodeInjection);
        }
        // 控制流量扁平化
        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.ControlFlowFlattening);

        // 重命名属性
        if (this.options.renameProperties) {
            astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.RenameProperties);
        }

        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.Converting);
        // 重命名标识符
        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.RenameIdentifiers);
        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.StringArray);

        if (this.options.simplify) {
            astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.Simplifying);
        }

        astTree = this.runNodeTransformationStage(astTree, NodeTransformationStage.Finalizing);

        return astTree;
    }

    /**
     * @param {string} sourceCode
     * @param {Program} astTree
     * @returns {IGeneratorOutput}
     */
    private generateCode (sourceCode: string, astTree: ESTree.Program): IGeneratorOutput {
        const escodegenParams: escodegen.GenerateOptions = {
            ...JavaScriptObfuscator.escodegenParams,
            format: {
                compact: this.options.compact
            },
            ...this.options.sourceMap && {
                ...this.options.sourceMapSourcesMode === SourceMapSourcesMode.SourcesContent
                    ? {
                        sourceMap: 'sourceMap',
                        sourceContent: sourceCode
                    }
                    : {
                        sourceMap: this.options.inputFileName || 'sourceMap'
                    }
            }
        };

        const generatorOutput: IGeneratorOutput = escodegen.generate(astTree, escodegenParams);

        generatorOutput.map = generatorOutput.map ? generatorOutput.map.toString() : '';

        return generatorOutput;
    }

    /**
     * @param {IGeneratorOutput} generatorOutput
     * @returns {IObfuscationResult}
     */
    private getObfuscationResult (generatorOutput: IGeneratorOutput): IObfuscationResult {
        return this.obfuscationResultFactory(generatorOutput.code, generatorOutput.map);
    }

    /**
     * @param {string} code
     * @param {CodeTransformationStage} codeTransformationStage
     * @returns {string}
     */
    private runCodeTransformationStage (code: string, codeTransformationStage: CodeTransformationStage): string {
        this.logger.info(LoggingMessage.CodeTransformationStage, codeTransformationStage);

        return this.codeTransformersRunner.transform(
            code,
            JavaScriptObfuscator.codeTransformersList,
            codeTransformationStage
        );
    }

    /**
     * @param {Program} astTree AST 树
     * @param {NodeTransformationStage} nodeTransformationStage 节点转换阶段
     * @returns {Program}
     */
    private runNodeTransformationStage (astTree: ESTree.Program, nodeTransformationStage: NodeTransformationStage): ESTree.Program {
        this.logger.info(LoggingMessage.NodeTransformationStage, nodeTransformationStage);

        return this.nodeTransformersRunner.transform(
            astTree,
            JavaScriptObfuscator.nodeTransformersList,
            nodeTransformationStage
        );
    }
}
