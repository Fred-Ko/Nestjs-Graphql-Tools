import { Field, InputType, PartialType, ReturnTypeFunc, TypeMetadataStorage } from "@nestjs/graphql";
import { BaseEntity } from "../common";
import { standardize } from "../utils/functions";
import { FILTER_DECORATOR_CUSTOM_FIELDS_METADATA_KEY, FILTER_OPERATION_PREFIX } from "./constants";
import { GraphqlFilterTypeDecoratorMetadata } from "./decorators/field.decorator";

export enum OperationQuery {
  eq = 'eq',
  neq = 'neq',
  gt = 'gt',
  gte = 'gte',
  lt = 'lt',
  lte = 'lte',
  in = 'in',
  notin = 'notin',
  like = 'like',
  notlike = 'notlike',
  between = 'between',
  notbetween = 'notbetween',
  null = 'null',
}

const arrayLikeOperations = new Set([OperationQuery.between, OperationQuery.notbetween, OperationQuery.in, OperationQuery.notin]);
const stringLikeOperations = new Set([OperationQuery.like, OperationQuery.notlike]);

export enum InputMapPrefixes {
  PropertyFilterInputType = 'PropertyFilterInputType',
  FilterInputType = 'FilterInputType',
}

export interface FilterFieldDefinition {
  /** Filter name. This name will be shown in the playground */
  name: string;
  /** Graphql type function. Basic types Int, String, Boolean, GraphQLISODateTime. Example value () => String */
  typeFn: ReturnTypeFunc;
} 

// export interface CustomFilterFieldDefinition extends FilterFieldDefinition {
//   /** Left side of conditional sql expression. 
//    * Examples: 
//    * 1. Select * from task t where t.title ilike '%test%'. Statement t.title is the left side of a statement 
//    * 2. Select * from user u where concat(u.fname, ' ', u.lname) ilike %alex%. Statement concat(u.fname, ' ', u.lname) is the left side of the conditional statement*/
//   sqlExp: string;
// }

export enum EObjectResolveType {
  Full,
  Enum
}

const filterFullTypes = new Map();
const filterTypes = new Map();
const propertyTypes = new Map()

const generateFilterPropertyType = (field) => {
  let typeName = field.typeFn && field.typeFn()?.name;
  let objectResolveType = EObjectResolveType.Full;

  if (field.typeFn && !typeName) {
    const enumMeta = TypeMetadataStorage.getEnumsMetadata().find(x => x.ref === field.typeFn());
    typeName = enumMeta.name;
    objectResolveType = EObjectResolveType.Enum
  }

  const key = `${standardize(typeName)}_${InputMapPrefixes.PropertyFilterInputType}`;

  const propType = propertyTypes.get(key);
  if (propType) return propType;

  class PropertyFilter {}
  InputType(key, {isAbstract: true})(PropertyFilter);

  const availableOperations = Object.keys(OperationQuery).filter((operation: OperationQuery) => {
    if (objectResolveType === EObjectResolveType.Enum) {
      return [
        OperationQuery.eq, 
        OperationQuery.neq, 
        OperationQuery.in, 
        OperationQuery.notin, 
        OperationQuery.null
      ].includes(operation)
    } else {
      return true
    }
  })

  availableOperations.forEach(operationName => {
    field.typeFn();
    Field(() => {
      if (arrayLikeOperations.has(OperationQuery[operationName])) {
        return [field.typeFn()];
      } if ([OperationQuery.null].includes(OperationQuery[operationName])) {
        return Boolean;
      } else if (stringLikeOperations.has(OperationQuery[operationName])) {
        return String;
      } else {
        return field.typeFn();
      }
    }
    , {...field.options, nullable: true})(PropertyFilter.prototype, FILTER_OPERATION_PREFIX ? `${FILTER_OPERATION_PREFIX}${operationName}` : operationName);
  })

  Object.defineProperty(PropertyFilter, 'name', {
    value: key,
  });

  propertyTypes.set(key, PropertyFilter);
  return PropertyFilter;
}

function generateFilterInputType<T extends BaseEntity>(classes: T[], name: string) {
  const key = `${name}${InputMapPrefixes.FilterInputType}`;
  if (filterTypes.get(key)) {
    return filterTypes.get(key);
  }

  class PartialObjectType {}
  InputType(key, {isAbstract: true})(PartialObjectType);
  
  Object.defineProperty(PartialObjectType, 'name', {
    value: key,
  });

  filterTypes.set(key, PartialObjectType);

  const properties: FilterFieldDefinition[] = [];

  for (const typeFn of classes) {
    const customFilterData: GraphqlFilterTypeDecoratorMetadata = Reflect.getMetadata(FILTER_DECORATOR_CUSTOM_FIELDS_METADATA_KEY, typeFn.prototype)
    if (customFilterData && customFilterData.fields.size > 0) {
      properties.push(...Array.from(customFilterData.fields.values()).filter(x => !customFilterData?.excludedFilterFields.has(x.name)));
    }

    const classMetadata = TypeMetadataStorage.getObjectTypeMetadataByTarget(typeFn);
    if (classMetadata) {
      PartialType(typeFn, InputType); // cast to input type
      TypeMetadataStorage.loadClassPluginMetadata([classMetadata]);
      TypeMetadataStorage.compileClassMetadata([classMetadata]);

      const objectTypesMetadata = TypeMetadataStorage.getObjectTypesMetadata();
      const inheritedType = objectTypesMetadata.find(x => x.target.name === typeFn?.__extension__);
      
      if (inheritedType) {
        // Compile inherited type
        TypeMetadataStorage.loadClassPluginMetadata([inheritedType]);
        TypeMetadataStorage.compileClassMetadata([inheritedType]);
      }

      if (!classMetadata?.properties) {
        throw new Error(`DTO ${typeFn.name} hasn't been initialized yet`)
      }
      
      let classMetaProps = classMetadata.properties;

      if (customFilterData) {
        classMetaProps = classMetadata.properties.filter(x => !customFilterData?.excludedFilterFields.has(x.name));
      }
      
      properties.push(...(inheritedType?.properties || []), ...classMetaProps)
    }
  }

  for (const field of properties) {
    const targetClassMetadata = TypeMetadataStorage.getObjectTypeMetadataByTarget(field.typeFn && field.typeFn() as BaseEntity);
    if (!targetClassMetadata) {
      if (typeof field.typeFn === 'function') {
        field.typeFn();
      }
      const fieldType = generateFilterPropertyType(field);
      Field(() => fieldType, {nullable: true})(PartialObjectType.prototype, field.name)
    } else {
      // Relations are not supported yet
      // let referenceInputType = filterTypes.get(`${field.name}${InputMapPrefixes.PropertyFilterType}`);
      // if (!referenceInputType) {
      //   referenceInputType = generateFilterInputType(field.typeFn() as BaseEntity);
      // }
      // Field(() => referenceInputType, {nullable: true})(PartialObjectType.prototype, field.name)
    }
  }

  return PartialObjectType;
}

export type IFilterField<T> = {
  [K in keyof T]: {
    eq: T[K],
    neq: T[K],
    gt: T[K],
    gte: T[K],
    lt: T[K],
    lte: T[K],
    in: T[K],
    like: T[K],
    notlike: T[K],
    between: T[K],
    notbetween: T[K],
    null: T[K],
  };
}

export interface IFilter<T> {
  and: IFilterField<T>[];
  or: IFilterField<T>[];
}

export const getFilterFullInputType = (classes: BaseEntity[], name: string) => {
  const key = `${name}_FilterInputType`; 
  if (filterFullTypes.get(key)) {
    return filterFullTypes.get(key);
  }
  const FilterInputType = generateFilterInputType(classes, name);
  @InputType(key)
  class EntityWhereInput extends FilterInputType {
    @Field(() => [FilterInputType], {nullable: true})
    and: BaseEntity[];
    @Field(() => [FilterInputType], {nullable: true})
    or: BaseEntity[];
  }
  filterFullTypes.set(key, EntityWhereInput);
  return EntityWhereInput;
}