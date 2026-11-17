import {
  Create,
  Datagrid,
  DeleteButton,
  Edit,
  EditButton,
  FunctionField,
  List,
  NumberField,
  NumberInput,
  ReferenceManyField,
  required,
  SaveButton,
  SearchInput,
  SelectField,
  SelectInput,
  Show,
  SimpleForm,
  SimpleShowLayout,
  TextField,
  TextInput,
  Toolbar,
  TopToolbar,
  Pagination,
  Labeled,
} from 'react-admin';
import { CoverThumb, GENRES, ReadOnlyBadge, useIsAdmin } from '../components/common';

export const NATIONALITIES = [
  'Estonian', 'Azerbaijani', 'British', 'American', 'French', 'German', 'Japanese', 'Italian', 'Spanish', 'Polish',
  'Swedish', 'Finnish', 'Irish', 'Canadian', 'Brazilian', 'Nigerian', 'Indian', 'Turkish', 'Georgian', 'Latvian',
].map((n) => ({ id: n, name: n }));

const authorFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search name" />,
  <SelectInput key="nationality" source="nationality" choices={NATIONALITIES} alwaysOn emptyText="Any nationality" />,
];

export const AuthorList = () => {
  const isAdmin = useIsAdmin();
  return (
    <List filters={authorFilters} sort={{ field: 'lastName', order: 'ASC' }} perPage={25}>
      <Datagrid rowClick={isAdmin ? 'edit' : 'show'} bulkActionButtons={false}>
        <TextField source="lastName" />
        <TextField source="firstName" />
        <TextField source="nationality" />
        <NumberField source="birthYear" options={{ useGrouping: false }} />
        <NumberField source="bookCount" label="Books" sortable={false} />
      </Datagrid>
    </List>
  );
};

/** The author's books, shown inline on the author page. */
const AuthorBooks = () => {
  const isAdmin = useIsAdmin();
  return (
  <ReferenceManyField
    reference="books"
    target="authorId"
    label="Books by this author"
    sort={{ field: 'publishedYear', order: 'DESC' }}
    perPage={10}
    pagination={<Pagination rowsPerPageOptions={[10, 25]} />}
  >
    <Datagrid bulkActionButtons={false} rowClick={isAdmin ? 'edit' : 'show'}>
      <FunctionField label="" render={() => <CoverThumb size={28} />} />
      <TextField source="title" />
      <SelectField source="genre" choices={GENRES} />
      <NumberField source="publishedYear" label="Year" options={{ useGrouping: false }} />
      <FunctionField label="Available" render={(r: any) => `${r.availableCopies} / ${r.totalCopies}`} />
    </Datagrid>
  </ReferenceManyField>
  );
};

const authorFields = (
  <>
    <TextInput source="firstName" validate={required()} />
    <TextInput source="lastName" validate={required()} />
    <SelectInput source="nationality" choices={NATIONALITIES} />
    <NumberInput source="birthYear" />
    <TextInput source="bio" multiline fullWidth minRows={3} />
  </>
);

const AuthorEditToolbar = () => (
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

export const AuthorEdit = () => (
  <Edit mutationMode="pessimistic">
    <SimpleForm toolbar={<AuthorEditToolbar />}>
      {authorFields}
      <AuthorBooks />
    </SimpleForm>
  </Edit>
);

export const AuthorCreate = () => (
  <Create redirect="edit">
    <SimpleForm>{authorFields}</SimpleForm>
  </Create>
);

const AuthorShowActions = () => {
  const isAdmin = useIsAdmin();
  return (
    <TopToolbar>
      <ReadOnlyBadge />
      {isAdmin && <EditButton />}
    </TopToolbar>
  );
};

export const AuthorShow = () => (
  <Show actions={<AuthorShowActions />}>
    <SimpleShowLayout>
      <TextField source="fullName" label="Name" />
      <TextField source="nationality" />
      <NumberField source="birthYear" options={{ useGrouping: false }} />
      <TextField source="bio" />
      <Labeled label="Books" fullWidth>
        <AuthorBooks />
      </Labeled>
    </SimpleShowLayout>
  </Show>
);
