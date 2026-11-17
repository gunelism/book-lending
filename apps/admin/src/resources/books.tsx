import { Stack } from '@mui/material';
import {
  AutocompleteInput,
  Create,
  Datagrid,
  DeleteButton,
  Edit,
  EditButton,
  FunctionField,
  Labeled,
  List,
  NullableBooleanInput,
  NumberField,
  NumberInput,
  ReferenceField,
  ReferenceInput,
  ReferenceManyField,
  required,
  SaveButton,
  SearchInput,
  SelectField,
  SelectInput,
  Show,
  SimpleForm,
  TabbedForm,
  TabbedShowLayout,
  TextField,
  TextInput,
  Toolbar,
  TopToolbar,
  Datagrid as LoanGrid,
  DateField,
} from 'react-admin';
import { CopiesInline } from '../components/CopiesInline';
import { CoverUploader } from '../components/CoverUploader';
import { CoverThumb, GENRES, MoneyField, ReadOnlyBadge, StatusField, useIsAdmin } from '../components/common';
import { useFieldHelp } from '../formHelp';

const bookFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Title, ISBN or author" />,
  <SelectInput key="genre" source="genre" choices={GENRES} alwaysOn emptyText="All genres" />,
  <ReferenceInput key="authorId" source="authorId" reference="authors">
    <AutocompleteInput label="Author" filterToQuery={(q: string) => ({ q })} />
  </ReferenceInput>,
  <NullableBooleanInput key="available" source="available" label="Copy available" />,
  <NullableBooleanInput key="hasCover" source="hasCover" label="Has cover" />,
  <NumberInput key="publishedFrom" source="publishedFrom" label="Published from" />,
  <NumberInput key="publishedTo" source="publishedTo" label="Published to" />,
];

const renderAvailability = (r: any) => (
  <span style={{ color: r.availableCopies ? undefined : '#c62828' }}>
    {r.availableCopies} / {r.totalCopies}
  </span>
);

export const BookList = () => {
  const isAdmin = useIsAdmin();
  return (
    <List filters={bookFilters} sort={{ field: 'title', order: 'ASC' }} perPage={25}>
      <Datagrid rowClick={isAdmin ? 'edit' : 'show'} bulkActionButtons={false}>
        <FunctionField label="" render={() => <CoverThumb />} />
        <TextField source="title" />
        <ReferenceField source="authorId" reference="authors" sortBy="author.lastName" />
        <SelectField source="genre" choices={GENRES} />
        <NumberField source="publishedYear" label="Year" options={{ useGrouping: false }} />
        <TextField source="isbn" label="ISBN" />
        <FunctionField label="Available" render={renderAvailability} />
      </Datagrid>
    </List>
  );
};

/** Helper texts come from the API's field definitions — the same ones the Help chat answers from. */
const BookFields = () => {
  const help = useFieldHelp('book');
  return (
    <>
      <TextInput source="title" validate={required()} fullWidth helperText={help('title')} />
      <ReferenceInput source="authorId" reference="authors">
        <AutocompleteInput filterToQuery={(q: string) => ({ q })} validate={required()} helperText={help('authorId')} />
      </ReferenceInput>
      <TextInput source="isbn" label="ISBN" validate={required()} helperText={help('isbn')} fullWidth />
      <SelectInput source="genre" choices={GENRES} validate={required()} helperText={help('genre')} />
      <NumberInput source="publishedYear" label="Published year" helperText={help('publishedYear')} />
      <NumberInput
        source="replacementCostCents"
        label="Replacement cost (€)"
        format={(v: number | null) => (v == null ? '' : v / 100)}
        parse={(v: string) => (v === '' ? null : Math.round(Number(v) * 100))}
        helperText={help('replacementCostCents')}
        fullWidth
      />
      <TextInput source="description" multiline fullWidth minRows={3} helperText={help('description')} />
    </>
  );
};

const BookEditToolbar = () => (
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

/** Admin view: book details, cover upload, inline copies editor, loan history. */
export const BookEdit = () => (
  <Edit mutationMode="pessimistic">
    <TabbedForm toolbar={<BookEditToolbar />}>
      <TabbedForm.Tab label="Details">
        <CoverUploader />
        <BookFields />
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Copies" path="copies">
        <CopiesInline />
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Loan history" path="loans">
        <BookLoans />
      </TabbedForm.Tab>
    </TabbedForm>
  </Edit>
);

const BookLoans = () => (
  <ReferenceManyField reference="loans" target="bookId" label={false} sort={{ field: 'loanedAt', order: 'DESC' }} perPage={10}>
    <LoanGrid bulkActionButtons={false} rowClick="show">
      <TextField source="copy.barcode" label="Copy" sortable={false} />
      <ReferenceField source="memberId" reference="members" label="Member" link="edit" sortable={false} />
      <DateField source="loanedAt" label="Loaned" />
      <DateField source="dueDate" label="Due" />
      <DateField source="returnedAt" label="Returned" emptyText="—" />
      <StatusField source="displayStatus" label="Status" sortBy="status" />
      <MoneyField source="accruedFineCents" label="Fine" sortable={false} />
    </LoanGrid>
  </ReferenceManyField>
);

export const BookCreate = () => (
  <Create redirect="edit">
    <SimpleForm defaultValues={{ replacementCostCents: 2500 }}>
      <BookFields />
    </SimpleForm>
  </Create>
);

const BookShowActions = () => {
  const isAdmin = useIsAdmin();
  return (
    <TopToolbar>
      <ReadOnlyBadge />
      {isAdmin && <EditButton />}
    </TopToolbar>
  );
};

/** Librarian view: everything visible, nothing editable. */
export const BookShow = () => (
  <Show actions={<BookShowActions />}>
    <TabbedShowLayout>
      <TabbedShowLayout.Tab label="Details">
        <Stack direction="row" spacing={3}>
          <CoverThumb size={120} />
          <Stack spacing={1}>
            <TextField source="title" variant="h6" />
            <ReferenceField source="authorId" reference="authors" link="show" />
            <Labeled label="ISBN">
              <TextField source="isbn" />
            </Labeled>
            <Labeled label="Genre">
              <SelectField source="genre" choices={GENRES} />
            </Labeled>
            <Labeled label="Published">
              <NumberField source="publishedYear" options={{ useGrouping: false }} />
            </Labeled>
            <Labeled label="Available copies">
              <FunctionField render={renderAvailability} />
            </Labeled>
            <Labeled label="Replacement cost">
              <MoneyField source="replacementCostCents" />
            </Labeled>
          </Stack>
        </Stack>
        <TextField source="description" emptyText="No description" />
      </TabbedShowLayout.Tab>
      <TabbedShowLayout.Tab label="Copies" path="copies">
        <CopiesInline readOnly />
      </TabbedShowLayout.Tab>
      <TabbedShowLayout.Tab label="Loan history" path="loans">
        <BookLoans />
      </TabbedShowLayout.Tab>
    </TabbedShowLayout>
  </Show>
);
