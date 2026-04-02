import React from 'react';
import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';

interface BreadcrumbItem {
  title: string;
  path?: string;
}

interface Props {
  items: BreadcrumbItem[];
  homeUrl?: string;
}

const PageBreadcrumb: React.FC<Props> = ({ items, homeUrl = '/dashboard' }) => (
  <Breadcrumb
    style={{ marginBottom: 16 }}
    items={[
      { title: <Link to={homeUrl}><HomeOutlined /></Link> },
      ...items.map((item, idx) => ({
        title: item.path && idx < items.length - 1
          ? <Link to={item.path}>{item.title}</Link>
          : item.title,
      })),
    ]}
  />
);

export default PageBreadcrumb;
