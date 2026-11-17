import {
  BooleanField,
  BooleanInput,
  Create,
  Datagrid,
  DateField,
  DeleteButton,
  Edit,
  EmailField,
  List,
  NullableBooleanInput,
  PasswordInput,
  required,
  SaveButton,
  SearchInput,
  SelectField,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  email,
  minLength,
  regex,
} from 'react-admin';

const ROLES = [
  { id: 'ADMIN', name: 'Admin' },
  { id: 'LIBRARIAN', name: 'Librarian' },
];

const passwordRules = [
  minLength(12, 'At least 12 characters'),
  regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Needs upper-case, lower-case and a digit'),
];

const userFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <SelectInput key="role" source="role" choices={ROLES} alwaysOn emptyText="Any role" />,
  <NullableBooleanInput key="isActive" source="isActive" label="Active" />,
];

/** Staff accounts. This whole resource only exists for admins. */
export const UserList = () => (
  <List filters={userFilters} sort={{ field: 'name', order: 'ASC' }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="name" />
      <EmailField source="email" />
      <SelectField source="role" choices={ROLES} />
      <BooleanField source="isActive" label="Active" />
      <BooleanField source="githubLinked" label="GitHub" sortable={false} />
      <DateField source="lastLoginAt" label="Last sign-in" showTime emptyText="never" />
    </Datagrid>
  </List>
);

const UserToolbar = () => (
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <SaveButton />
    <DeleteButton mutationMode="pessimistic" />
  </Toolbar>
);

export const UserEdit = () => (
  <Edit mutationMode="pessimistic">
    <SimpleForm toolbar={<UserToolbar />}>
      <TextField source="email" />
      <TextInput source="name" validate={required()} />
      <SelectInput source="role" choices={ROLES} validate={required()} />
      <BooleanInput source="isActive" label="Active" helperText="New GitHub sign-ups stay inactive until you approve them here" />
      <PasswordInput source="password" label="New password" validate={passwordRules} helperText="Leave empty to keep the current password. Changing it signs the user out." />
    </SimpleForm>
  </Edit>
);

export const UserCreate = () => (
  <Create redirect="list">
    <SimpleForm defaultValues={{ role: 'LIBRARIAN', isActive: true }}>
      <TextInput source="email" validate={[required(), email()]} />
      <TextInput source="name" validate={required()} />
      <SelectInput source="role" choices={ROLES} validate={required()} />
      <PasswordInput source="password" validate={[required(), ...passwordRules]} />
      <BooleanInput source="isActive" label="Active" />
    </SimpleForm>
  </Create>
);
