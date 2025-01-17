import { inject, injectable } from 'inversify';

import { ServiceIdentifiers } from '../container/ServiceIdentifiers';

import * as estraverse from '@javascript-obfuscator/estraverse';
import * as ESTree from 'estree';

import { TNodeTransformerFactory } from '../types/container/node-transformers/TNodeTransformerFactory';
import { TDictionary } from '../types/TDictionary';
import { TVisitorDirection } from '../types/node-transformers/TVisitorDirection';
import { TVisitorFunction } from '../types/node-transformers/TVisitorFunction';
import { TVisitorResult } from '../types/node-transformers/TVisitorResult';

import { INodeTransformer } from '../interfaces/node-transformers/INodeTransformer';
import { INodeTransformersRunner } from '../interfaces/node-transformers/INodeTransformersRunner';
import { ITransformerNamesGroupsBuilder } from '../interfaces/utils/ITransformerNamesGroupsBuilder';
import { IVisitor } from '../interfaces/node-transformers/IVisitor';

import { NodeTransformer } from '../enums/node-transformers/NodeTransformer';
import { NodeTransformationStage } from '../enums/node-transformers/NodeTransformationStage';
import { VisitorDirection } from '../enums/node-transformers/VisitorDirection';

import { NodeGuards } from '../node/NodeGuards';
import { NodeMetadata } from '../node/NodeMetadata';

@injectable()
export class NodeTransformersRunner implements INodeTransformersRunner {
    /**
     * @type {TNodeTransformerFactory}
     */
    private readonly nodeTransformerFactory: TNodeTransformerFactory;

    /**
     * @type {ITransformerNamesGroupsBuilder}
     */
    private readonly nodeTransformerNamesGroupsBuilder: ITransformerNamesGroupsBuilder<
        NodeTransformer,
        INodeTransformer
    >;

    /**
     * @param {TNodeTransformerFactory} nodeTransformerFactory
     * @param {ITransformerNamesGroupsBuilder} nodeTransformerNamesGroupsBuilder
     */
    public constructor (
        @inject(ServiceIdentifiers.Factory__INodeTransformer)
            nodeTransformerFactory: TNodeTransformerFactory,
        @inject(ServiceIdentifiers.INodeTransformerNamesGroupsBuilder)
            nodeTransformerNamesGroupsBuilder: ITransformerNamesGroupsBuilder<
                NodeTransformer,
                INodeTransformer
            >,
    ) {
        this.nodeTransformerFactory = nodeTransformerFactory;
        this.nodeTransformerNamesGroupsBuilder = nodeTransformerNamesGroupsBuilder;
    }

    /**
     * @param {T} astTree AST Tree
     * @param {NodeTransformer[]} nodeTransformerNames 所有节点转换器名称
     * @param {NodeTransformationStage} nodeTransformationStage 节点转换器阶段名称
     * @returns {T}
     */
    public transform <T extends ESTree.Node = ESTree.Program> (
        astTree: T,
        nodeTransformerNames: NodeTransformer[],
        nodeTransformationStage: NodeTransformationStage
    ): T {
        if (!nodeTransformerNames.length) {
            return astTree;
        }
        // 节点转换器
        console.log('\r\n');
        console.log(nodeTransformationStage, ' ===> \r\n');
        console.log('\r\n');
        
        const normalizedNodeTransformers: TDictionary<INodeTransformer> =
        this.buildNormalizedNodeTransformers(nodeTransformerNames, nodeTransformationStage);
        // 节点转换器名称组
        const nodeTransformerNamesGroups: NodeTransformer[][] =
        this.nodeTransformerNamesGroupsBuilder.build(normalizedNodeTransformers);
        console.log('nodeTransformerNamesGroups', nodeTransformerNamesGroups);
        for (const nodeTransformerNamesGroup of nodeTransformerNamesGroups) {
            const enterVisitors: IVisitor[] = [];
            const leaveVisitors: IVisitor[] = [];

            for (const nodeTransformerName of nodeTransformerNamesGroup) {
                const nodeTransformer: INodeTransformer = normalizedNodeTransformers[nodeTransformerName];
                const visitor: IVisitor | null = nodeTransformer.getVisitor(nodeTransformationStage);

                if (!visitor) {
                    continue;
                }

                if (visitor.enter) {
                    enterVisitors.push({ enter: visitor.enter });
                }

                if (visitor.leave) {
                    leaveVisitors.push({ leave: visitor.leave });
                }
            }

            if (!enterVisitors.length && !leaveVisitors.length) {
                continue;
            }

            estraverse.replace(astTree, {
                enter: this.mergeVisitorsForDirection(enterVisitors, VisitorDirection.Enter),
                leave: this.mergeVisitorsForDirection(leaveVisitors, VisitorDirection.Leave)
            });
        }

        return astTree;
    }

    /**
     * 构建规范化的节点转换器
     * @param {NodeTransformer[]} nodeTransformerNames
     * @param {NodeTransformationStage} nodeTransformationStage
     * @returns {TDictionary<INodeTransformer>}
     */
    private buildNormalizedNodeTransformers (
        nodeTransformerNames: NodeTransformer[],
        nodeTransformationStage: NodeTransformationStage
    ): TDictionary<INodeTransformer> {
        return nodeTransformerNames
            .reduce<TDictionary<INodeTransformer>>(
                (acc: TDictionary<INodeTransformer>, nodeTransformerName: NodeTransformer) => {
                    const nodeTransformer: INodeTransformer = this.nodeTransformerFactory(nodeTransformerName);

                    if (!nodeTransformer.getVisitor(nodeTransformationStage)) {
                        return acc;
                    }

                    return <TDictionary<INodeTransformer>>{
                        ...acc,
                        [nodeTransformerName]: nodeTransformer
                    };
                },
                {}
            );
    }

    /**
     * @param {IVisitor[]} visitors
     * @param {TVisitorDirection} direction
     * @returns {TVisitorFunction}
     */
    private mergeVisitorsForDirection (visitors: IVisitor[], direction: TVisitorDirection): TVisitorFunction {
        const visitorsLength: number = visitors.length;

        if (!visitorsLength) {
            return (node: ESTree.Node, parentNode: ESTree.Node | null): ESTree.Node => node;
        }

        return (node: ESTree.Node, parentNode: ESTree.Node | null): ESTree.Node | estraverse.VisitorOption => {
            if (NodeMetadata.isIgnoredNode(node)) {
                return estraverse.VisitorOption.Skip;
            }

            for (let i: number = 0; i < visitorsLength; i++) {
                const visitorFunction: TVisitorFunction | undefined = visitors[i][direction];

                if (!visitorFunction) {
                    continue;
                }

                const visitorResult: TVisitorResult = visitorFunction(node, parentNode);
                const isValidVisitorResult = visitorResult && NodeGuards.isNode(visitorResult);

                if (!isValidVisitorResult) {
                    continue;
                }

                node = visitorResult;
            }

            return node;
        };
    }
}
